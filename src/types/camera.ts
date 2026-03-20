export interface Camera {
  id: string;
  name: string;
  description?: string;
  recordFolder: string;
  aiAnalysis?: boolean;
}

export interface Recording {
  id: number;
  camera_id: string;
  filename: string;
  filepath: string;
  size: number | null;
  duration: number | null;
  recorded_at: string | null;
  created_at: string;
}
