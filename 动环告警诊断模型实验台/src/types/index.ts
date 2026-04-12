export interface Experiment {
  id: string;
  name: string;
  scene: string;
  base_model: string;
  trainer_backend: string;
  route_type: string;
  dataset_version: string;
  evalset_version: string;
  prompt_template_version: string;
  train_config: Record<string, any>;
  infer_config: Record<string, any>;
  status: 'draft' | 'queued' | 'running' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface Run {
  id: string;
  experiment_id: string;
  run_no: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  current_step: string | null;
  output_dir: string | null;
  log_path: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  artifacts: Artifact[];
  metrics: Metric[];
}

export interface Artifact {
  id: number;
  run_id: string;
  artifact_type: string;
  file_path: string;
  meta_json?: string | null;
  created_at: string;
}

export interface Metric {
  id: number;
  run_id: string;
  metric_group: string;
  metric_name: string;
  metric_value: number;
  metric_extra_json?: string | null;
  created_at: string;
}
