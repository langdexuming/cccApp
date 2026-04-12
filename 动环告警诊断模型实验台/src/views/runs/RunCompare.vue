<template>
  <div class="page-run-compare">
    <section class="compare-hero">
      <div class="hero-copy">
        <div class="hero-badge">
          <GitCompareArrows :size="14" />
          <span>Model Compare Workspace</span>
        </div>
        <h1 class="hero-title">Qwen Run Compare Bench</h1>
        <p class="hero-desc">
          Compare Qwen3.5-2B-Base and Qwen3.5-2B runs across training quality, exported artifacts,
          and offline evaluation readiness inside a single workbench surface.
        </p>
      </div>

      <div class="hero-metrics">
        <div class="hero-metric-card">
          <span class="metric-label">Shared Metrics</span>
          <strong class="metric-value">{{ sharedMetricCount }}</strong>
          <span class="metric-note">common score slots</span>
        </div>
        <div class="hero-metric-card">
          <span class="metric-label">Different Metrics</span>
          <strong class="metric-value">{{ differentMetricCount }}</strong>
          <span class="metric-note">numerical gaps</span>
        </div>
        <div class="hero-metric-card">
          <span class="metric-label">Artifact Coverage</span>
          <strong class="metric-value">{{ sharedArtifactCount }}</strong>
          <span class="metric-note">shared artifact types</span>
        </div>
      </div>
    </section>

    <PanelCard title="Run Selector" subtitle="Choose two completed or in-flight runs for side-by-side comparison.">
      <div class="selector-grid">
        <div class="selector-panel selector-panel--left">
          <span class="selector-label">Candidate A</span>
          <el-select v-model="leftRunId" placeholder="Select left run" style="width: 100%">
            <el-option
              v-for="item in mockRuns"
              :key="`left-${item.id}`"
              :label="buildRunOptionLabel(item)"
              :value="item.id"
            />
          </el-select>
        </div>

        <button class="swap-button" type="button" @click="swapRuns">
          <ArrowLeftRight :size="18" />
        </button>

        <div class="selector-panel selector-panel--right">
          <span class="selector-label">Candidate B</span>
          <el-select v-model="rightRunId" placeholder="Select right run" style="width: 100%">
            <el-option
              v-for="item in mockRuns"
              :key="`right-${item.id}`"
              :label="buildRunOptionLabel(item)"
              :value="item.id"
            />
          </el-select>
        </div>
      </div>
    </PanelCard>

    <div class="snapshot-grid">
      <PanelCard class="snapshot-card snapshot-card--left">
        <template #header>
          <div class="snapshot-header">
            <div>
              <span class="snapshot-kicker">Candidate A</span>
              <h3 class="snapshot-title">{{ leftRun?.id || 'No run selected' }}</h3>
            </div>
            <StatusBadge v-if="leftRun" :status="leftRun.status" />
          </div>
        </template>

        <div v-if="leftRun && leftExperiment" class="snapshot-body">
          <div class="snapshot-chip-row">
            <span class="snapshot-chip">{{ leftExperiment.base_model }}</span>
            <span class="snapshot-chip">{{ leftExperiment.trainer_backend }}</span>
            <span class="snapshot-chip">{{ leftExperiment.route_type }}</span>
          </div>

          <div class="snapshot-grid-inner">
            <div class="snapshot-item">
              <span class="item-label">Experiment</span>
              <span class="item-value mono-text">{{ leftRun.experiment_id }}</span>
            </div>
            <div class="snapshot-item">
              <span class="item-label">Current Step</span>
              <span class="item-value">{{ leftRun.current_step || '-' }}</span>
            </div>
            <div class="snapshot-item">
              <span class="item-label">Duration</span>
              <span class="item-value">{{ formatDuration(leftRun) }}</span>
            </div>
            <div class="snapshot-item">
              <span class="item-label">Metrics</span>
              <span class="item-value">{{ leftRun.metrics.length }}</span>
            </div>
          </div>

          <div class="path-stack">
            <div class="path-block">
              <span class="path-label">Output Directory</span>
              <div class="path-value mono-text">{{ leftRun.output_dir || 'N/A' }}</div>
            </div>
            <div class="path-block">
              <span class="path-label">Log Path</span>
              <div class="path-value mono-text">{{ leftRun.log_path || 'N/A' }}</div>
            </div>
          </div>
        </div>
      </PanelCard>

      <PanelCard class="snapshot-card snapshot-card--right">
        <template #header>
          <div class="snapshot-header">
            <div>
              <span class="snapshot-kicker">Candidate B</span>
              <h3 class="snapshot-title">{{ rightRun?.id || 'No run selected' }}</h3>
            </div>
            <StatusBadge v-if="rightRun" :status="rightRun.status" />
          </div>
        </template>

        <div v-if="rightRun && rightExperiment" class="snapshot-body">
          <div class="snapshot-chip-row">
            <span class="snapshot-chip">{{ rightExperiment.base_model }}</span>
            <span class="snapshot-chip">{{ rightExperiment.trainer_backend }}</span>
            <span class="snapshot-chip">{{ rightExperiment.route_type }}</span>
          </div>

          <div class="snapshot-grid-inner">
            <div class="snapshot-item">
              <span class="item-label">Experiment</span>
              <span class="item-value mono-text">{{ rightRun.experiment_id }}</span>
            </div>
            <div class="snapshot-item">
              <span class="item-label">Current Step</span>
              <span class="item-value">{{ rightRun.current_step || '-' }}</span>
            </div>
            <div class="snapshot-item">
              <span class="item-label">Duration</span>
              <span class="item-value">{{ formatDuration(rightRun) }}</span>
            </div>
            <div class="snapshot-item">
              <span class="item-label">Metrics</span>
              <span class="item-value">{{ rightRun.metrics.length }}</span>
            </div>
          </div>

          <div class="path-stack">
            <div class="path-block">
              <span class="path-label">Output Directory</span>
              <div class="path-value mono-text">{{ rightRun.output_dir || 'N/A' }}</div>
            </div>
            <div class="path-block">
              <span class="path-label">Log Path</span>
              <div class="path-value mono-text">{{ rightRun.log_path || 'N/A' }}</div>
            </div>
          </div>
        </div>
      </PanelCard>
    </div>

    <div class="compare-content-grid">
      <PanelCard title="Metric Delta Matrix" subtitle="Raw metric deltas are computed as Candidate B minus Candidate A.">
        <div class="compare-table">
          <div class="compare-row compare-row--head">
            <span>Metric</span>
            <span>Candidate A</span>
            <span>Candidate B</span>
            <span>Delta</span>
          </div>
          <div
            v-for="row in metricRows"
            :key="row.key"
            class="compare-row"
            :class="{ 'is-different': row.isDifferent }"
          >
            <span class="metric-key">{{ row.key }}</span>
            <span>{{ row.leftLabel }}</span>
            <span>{{ row.rightLabel }}</span>
            <span class="delta-cell" :class="row.deltaClass">{{ row.deltaLabel }}</span>
          </div>
        </div>
      </PanelCard>

      <PanelCard title="Artifact Footprint" subtitle="Highlight which outputs exist on each side and how far each run reached.">
        <div class="artifact-stack">
          <div
            v-for="artifact in artifactRows"
            :key="artifact.key"
            class="artifact-row"
          >
            <div class="artifact-meta">
              <span class="artifact-name">{{ artifact.key }}</span>
              <span class="artifact-count">
                {{ artifact.leftExists ? 'A' : '-' }} / {{ artifact.rightExists ? 'B' : '-' }}
              </span>
            </div>
            <div class="artifact-presence-grid">
              <div class="artifact-box" :class="{ present: artifact.leftExists }">
                <span class="artifact-side">Candidate A</span>
                <span class="artifact-path mono-text">{{ artifact.leftPath || 'Not generated' }}</span>
              </div>
              <div class="artifact-box" :class="{ present: artifact.rightExists }">
                <span class="artifact-side">Candidate B</span>
                <span class="artifact-path mono-text">{{ artifact.rightPath || 'Not generated' }}</span>
              </div>
            </div>
          </div>
        </div>
      </PanelCard>
    </div>

    <div v-if="leftRun?.error_message || rightRun?.error_message" class="error-grid">
      <PanelCard title="Candidate A Error">
        <pre class="error-box"><code>{{ leftRun?.error_message || 'No error' }}</code></pre>
      </PanelCard>
      <PanelCard title="Candidate B Error">
        <pre class="error-box"><code>{{ rightRun?.error_message || 'No error' }}</code></pre>
      </PanelCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeftRight, GitCompareArrows } from 'lucide-vue-next';
import PanelCard from '@/components/ui/PanelCard.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { mockExperiments, mockRuns } from '@/api/mock';
import type { Run } from '@/types';

const route = useRoute();
const router = useRouter();

const completedRuns = mockRuns.filter((item) => item.status === 'completed');
const fallbackLeft = completedRuns[0]?.id || mockRuns[0]?.id || '';
const fallbackRight = completedRuns[1]?.id || mockRuns[1]?.id || fallbackLeft;

const leftRunId = ref(typeof route.query.left === 'string' ? route.query.left : fallbackLeft);
const rightRunId = ref(typeof route.query.right === 'string' ? route.query.right : fallbackRight);

const experimentMap = computed(() => {
  return new Map(mockExperiments.map((item) => [item.id, item]));
});

const leftRun = computed(() => mockRuns.find((item) => item.id === leftRunId.value) || null);
const rightRun = computed(() => mockRuns.find((item) => item.id === rightRunId.value) || null);

const leftExperiment = computed(() => {
  return leftRun.value ? experimentMap.value.get(leftRun.value.experiment_id) || null : null;
});

const rightExperiment = computed(() => {
  return rightRun.value ? experimentMap.value.get(rightRun.value.experiment_id) || null : null;
});

const metricRows = computed(() => {
  const leftMetrics = new Map(
    (leftRun.value?.metrics || []).map((item) => [`${item.metric_group}.${item.metric_name}`, item.metric_value]),
  );
  const rightMetrics = new Map(
    (rightRun.value?.metrics || []).map((item) => [`${item.metric_group}.${item.metric_name}`, item.metric_value]),
  );

  const metricKeys = Array.from(new Set([...leftMetrics.keys(), ...rightMetrics.keys()])).sort();

  return metricKeys.map((key) => {
    const left = leftMetrics.get(key);
    const right = rightMetrics.get(key);
    const bothNumeric = typeof left === 'number' && typeof right === 'number';
    const delta = bothNumeric ? Number((right - left).toFixed(4)) : null;

    return {
      key,
      leftLabel: formatMetric(left),
      rightLabel: formatMetric(right),
      deltaLabel: delta === null ? 'n/a' : delta > 0 ? `+${delta}` : `${delta}`,
      deltaClass: delta === null ? 'delta-neutral' : delta > 0 ? 'delta-up' : delta < 0 ? 'delta-down' : 'delta-flat',
      isDifferent: left !== right,
    };
  });
});

const artifactRows = computed(() => {
  const leftArtifacts = new Map((leftRun.value?.artifacts || []).map((item) => [item.artifact_type, item.file_path]));
  const rightArtifacts = new Map((rightRun.value?.artifacts || []).map((item) => [item.artifact_type, item.file_path]));
  const artifactKeys = Array.from(new Set([...leftArtifacts.keys(), ...rightArtifacts.keys()])).sort();

  return artifactKeys.map((key) => ({
    key,
    leftExists: leftArtifacts.has(key),
    rightExists: rightArtifacts.has(key),
    leftPath: leftArtifacts.get(key) || '',
    rightPath: rightArtifacts.get(key) || '',
  }));
});

const sharedMetricCount = computed(() => {
  return metricRows.value.filter((row) => row.leftLabel !== '-' && row.rightLabel !== '-').length;
});

const differentMetricCount = computed(() => {
  return metricRows.value.filter((row) => row.isDifferent).length;
});

const sharedArtifactCount = computed(() => {
  return artifactRows.value.filter((row) => row.leftExists && row.rightExists).length;
});

const buildRunOptionLabel = (run: Run) => {
  const experiment = experimentMap.value.get(run.experiment_id);
  return `${run.id} | ${experiment?.base_model || run.experiment_id} | ${run.status}`;
};

const formatMetric = (value?: number) => {
  if (value === undefined) {
    return '-';
  }
  if (Math.abs(value) < 1 && value !== 0) {
    return value.toFixed(4);
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
};

const formatDuration = (run: Run) => {
  if (!run.started_at || !run.finished_at) {
    return run.status === 'running' ? 'Running' : '-';
  }

  const start = new Date(run.started_at.replace(' ', 'T')).getTime();
  const end = new Date(run.finished_at.replace(' ', 'T')).getTime();
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
};

const swapRuns = () => {
  const currentLeft = leftRunId.value;
  leftRunId.value = rightRunId.value;
  rightRunId.value = currentLeft;
};

watch(
  [leftRunId, rightRunId],
  ([left, right]) => {
    router.replace({
      path: '/runs/compare',
      query: {
        left,
        right,
      },
    });
  },
  { immediate: true },
);
</script>

<style lang="scss" scoped>
.page-run-compare {
  padding: 32px;
  max-width: 1680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.compare-hero {
  position: relative;
  overflow: hidden;
  border-radius: 22px;
  padding: 28px 28px 24px;
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.25), transparent 28%),
    linear-gradient(135deg, #0f172a 0%, #111827 48%, #1d4ed8 100%);
  color: white;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.9fr);
  gap: 24px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);
}

.hero-copy {
  position: relative;
  z-index: 1;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.hero-title {
  margin: 18px 0 10px;
  font-size: 34px;
  line-height: 1.05;
  font-weight: 700;
  letter-spacing: -0.04em;
}

.hero-desc {
  margin: 0;
  max-width: 720px;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.7;
  font-size: 14px;
}

.hero-metrics {
  display: grid;
  gap: 12px;
  align-self: end;
}

.hero-metric-card {
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  gap: 6px;

  .metric-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .metric-value {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .metric-note {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
  }
}

.selector-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}

.selector-panel {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);

  &--left {
    box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.08);
  }

  &--right {
    box-shadow: inset 0 0 0 1px rgba(16, 185, 129, 0.08);
  }
}

.selector-label {
  display: inline-block;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.swap-button {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: #f8fafc;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: var(--color-accent);
    background: #eff6ff;
  }
}

.snapshot-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.snapshot-card {
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: auto 0 0 0;
    height: 4px;
    opacity: 0.9;
  }

  &--left::after {
    background: linear-gradient(90deg, #1d4ed8 0%, #60a5fa 100%);
  }

  &--right::after {
    background: linear-gradient(90deg, #059669 0%, #34d399 100%);
  }
}

.snapshot-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: 100%;
  gap: 16px;
}

.snapshot-kicker {
  display: inline-flex;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.snapshot-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.1;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: -0.03em;
}

.snapshot-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.snapshot-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.snapshot-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 600;
}

.snapshot-grid-inner {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.snapshot-item {
  padding: 14px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid var(--divider-color);
  display: flex;
  flex-direction: column;
  gap: 8px;

  .item-label {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .item-value {
    font-size: 15px;
    color: var(--text-primary);
    font-weight: 600;
  }
}

.path-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.path-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-label {
  font-size: 12px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.path-value {
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--divider-color);
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  word-break: break-word;
}

.compare-content-grid {
  display: grid;
  grid-template-columns: 1.15fr 0.95fr;
  gap: 24px;
}

.compare-table {
  display: flex;
  flex-direction: column;
}

.compare-row {
  display: grid;
  grid-template-columns: minmax(180px, 1.2fr) repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--divider-color);
  font-size: 13px;

  &:last-child {
    border-bottom: none;
  }

  &--head {
    padding-top: 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  &.is-different {
    background: linear-gradient(90deg, rgba(59, 130, 246, 0.035), transparent 65%);
  }
}

.metric-key {
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.delta-cell {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.delta-up {
  background: #ecfdf5;
  color: #047857;
}

.delta-down {
  background: #fef2f2;
  color: #b91c1c;
}

.delta-flat,
.delta-neutral {
  background: #f8fafc;
  color: #475569;
}

.artifact-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.artifact-row {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--divider-color);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.artifact-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 12px;
}

.artifact-name {
  font-weight: 700;
  color: var(--text-primary);
}

.artifact-count {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.artifact-presence-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.artifact-box {
  border-radius: 14px;
  border: 1px dashed var(--border-color);
  padding: 12px 14px;
  min-height: 82px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #ffffff;

  &.present {
    border-style: solid;
    border-color: rgba(59, 130, 246, 0.22);
    background: #f8fbff;
  }
}

.artifact-side {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.artifact-path {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.error-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.error-box {
  margin: 0;
  padding: 18px;
  border-radius: 16px;
  background: #0f172a;
  color: #f8fafc;
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}

@media (max-width: 1280px) {
  .compare-hero,
  .compare-content-grid,
  .snapshot-grid,
  .error-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .page-run-compare {
    padding: 20px;
  }

  .selector-grid,
  .artifact-presence-grid,
  .snapshot-grid-inner {
    grid-template-columns: 1fr;
  }

  .compare-row {
    grid-template-columns: 1fr;
  }

  .swap-button {
    width: 100%;
  }
}
</style>
