export interface IngestionJobData {
  repositoryId: string;
  url: string;
  owner: string;
  repo: string;
  defaultBranch?: string;
}

export interface IIngestionQueue {
  addJob(data: IngestionJobData): Promise<string>;
  getJob(jobId: string): Promise<unknown | null>;
  close(): Promise<void>;
}
