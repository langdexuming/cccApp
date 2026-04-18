import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';

interface ProjectRadarProps {
  scores: {
    performance: number;
    security: number;
    maintainability: number;
    innovation: number;
    robustness: number;
  };
}

export function ProjectRadar({ scores }: ProjectRadarProps) {
  const data = [
    { subject: '性能 (Perf)', A: scores.performance, fullMark: 100 },
    { subject: '安全 (Security)', A: scores.security, fullMark: 100 },
    { subject: '可维护性 (DevEx)', A: scores.maintainability, fullMark: 100 },
    { subject: '前瞻性 (Trends)', A: scores.innovation, fullMark: 100 },
    { subject: '稳健性 (Robust)', A: scores.robustness, fullMark: 100 },
  ];

  const average = Object.values(scores).reduce((a, b) => a + b, 0) / 5;

  return (
    <div className="bg-white rounded-3xl border border-border-theme p-6 shadow-sm overflow-hidden flex flex-col items-center">
      <div className="w-full mb-4 flex justify-between items-end">
        <div>
          <h4 className="text-xs font-black text-text-secondary uppercase tracking-widest">项目健康度雷达</h4>
          <div className="text-2xl font-black text-text-primary mt-1">{average.toFixed(1)} <span className="text-[10px] text-text-secondary font-medium">Avg Score</span></div>
        </div>
        <div className="text-[10px] font-bold text-accent-theme bg-accent-theme/5 px-2 py-1 rounded-lg border border-accent-theme/10">
          AI 全域评分
        </div>
      </div>
      
      <div className="w-full h-[250px] -ml-4">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
            <Radar
              name="Project"
              dataKey="A"
              stroke="#4f46e5"
              fill="#4f46e5"
              fillOpacity={0.4}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 w-full mt-2">
        {data.map((item) => (
          <div key={item.subject} className="flex flex-col gap-0.5 p-2 rounded-xl bg-zinc-50 border border-zinc-100">
            <span className="text-[8px] font-bold text-text-secondary truncate">{item.subject}</span>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1 bg-zinc-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent-theme rounded-full transition-all duration-1000" 
                  style={{ width: `${item.A}%` }} 
                />
              </div>
              <span className="text-[10px] font-black text-text-primary">{item.A}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
