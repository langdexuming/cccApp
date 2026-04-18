import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Network, Share2 } from 'lucide-react';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  type: 'file' | 'directory';
  group: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string;
  target: string;
}

interface ProjectGraphProps {
  tree: any[];
  dependencies?: Record<string, string[]>;
}

export function ProjectGraph({ tree, dependencies }: ProjectGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewMode, setViewMode] = useState<'structure' | 'dependencies'>('structure');

  useEffect(() => {
    if (!svgRef.current || !tree) return;

    // Convert tree to nodes and links
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    if (viewMode === 'structure') {
      function processItem(item: any, parentId?: string, depth: number = 0, currentPath: string = "") {
        const name = item.name;
        const fullPath = currentPath ? `${currentPath}/${name}` : name;
        const id = fullPath;
        
        nodes.push({
          id,
          type: item.children ? 'directory' : 'file',
          group: depth
        });

        if (parentId) {
          links.push({ source: parentId, target: id });
        }

        if (item.children) {
          item.children.forEach((child: any) => processItem(child, id, depth + 1, id));
        }
      }
      tree.forEach(item => processItem(item));
    } else if (dependencies) {
      // Deep Dependency View
      Object.keys(dependencies).forEach((file, i) => {
        nodes.push({
          id: file,
          type: 'file',
          group: i
        });
      });

      Object.entries(dependencies).forEach(([file, imports]) => {
        imports.forEach(imp => {
          // Heuristic: try to find the actual file for the import
          // This is a simplified version; in a real app, we'd resolve aliases and absolute paths
          const target = Object.keys(dependencies).find(f => f.includes(imp) || imp.includes(f));
          if (target && target !== file) {
            links.push({ source: file, target });
          }
        });
      });
    }

    // Clear existing
    d3.select(svgRef.current).selectAll("*").remove();

    const width = svgRef.current.clientWidth || 600;
    const height = 400;

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height]);

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(30))
      .force("charge", d3.forceManyBody().strength(-100))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.1))
      .force("y", d3.forceY(height / 2).strength(0.1));

    const link = svg.append("g")
      .attr("stroke", "#e2e8f0")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 1);

    const node = svg.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", d => d.type === 'directory' ? 6 : 4)
      .attr("fill", d => d.type === 'directory' ? "#4f46e5" : "#94a3b8")
      .call(drag(simulation as any));

    node.append("title")
      .text(d => d.id);

    simulation.on("tick", () => {
      link
        .attr("x1", d => (d.source as any).x)
        .attr("y1", d => (d.source as any).y)
        .attr("x2", d => (d.target as any).x)
        .attr("y2", d => (d.target as any).y);

      node
        .attr("cx", d => d.x!)
        .attr("cy", d => d.y!);
    });

    function drag(simulation: d3.Simulation<GraphNode, undefined>) {
      function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }

      function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }

      function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }

      return d3.drag<SVGCircleElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }

    return () => { simulation.stop(); };
  }, [tree, viewMode, dependencies]);

  return (
    <div className="w-full bg-zinc-50 rounded-2xl border border-border-theme overflow-hidden">
      <div className="p-4 border-b border-border-theme bg-white flex items-center justify-between">
        <h4 className="text-xs font-bold text-text-primary flex items-center gap-2">
          架构映射与依赖流图 (D3.js)
          <span className="px-1.5 py-0.5 bg-zinc-100 text-[10px] rounded">Live</span>
        </h4>
        
        <div className="flex bg-zinc-100 p-1 rounded-lg">
          <button 
            onClick={() => setViewMode('structure')}
            className={`flex items-center gap-2 px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'structure' ? 'bg-white shadow-sm text-accent-theme' : 'text-text-secondary'}`}
          >
            <Network className="w-3 h-3" />
            目录结构
          </button>
          <button 
            onClick={() => setViewMode('dependencies')}
            className={`flex items-center gap-2 px-3 py-1 rounded-md text-[10px] font-bold transition-all ${viewMode === 'dependencies' ? 'bg-white shadow-sm text-accent-theme' : 'text-text-secondary'}`}
          >
            <Share2 className="w-3 h-3" />
            逻辑依赖 (Deep Scan)
          </button>
        </div>
      </div>
      <svg ref={svgRef} className="w-full h-[400px] cursor-move" />
      <div className="p-3 bg-white border-t border-border-theme flex gap-6">
        {viewMode === 'structure' ? (
          <>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#4f46e5]" />
              <span className="text-[10px] text-text-secondary font-medium">目录</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#94a3b8]" />
              <span className="text-[10px] text-text-secondary font-medium">文件</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent-theme" />
              <span className="text-[10px] text-text-secondary font-medium">核心函数/组件</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-[1px] bg-[#e2e8f0]" />
              <span className="text-[10px] text-text-secondary font-medium">引用关系</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
