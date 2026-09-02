import { logger } from '../config/logger.js';

export interface DurationTimer {
  stop(): number;
}

export function startTimer(): DurationTimer {
  const start = process.hrtime.bigint();
  return {
    stop(): number {
      const end = process.hrtime.bigint();
      return Number(end - start) / 1_000_000; // milliseconds
    },
  };
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics = {
    totalRequests: 0,
    totalIngestions: 0,
    totalChunksIndexed: 0,
    totalLlmInvocations: 0,
    totalErrors: 0,
  };

  private constructor() {}

  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  public incrementRequests() {
    this.metrics.totalRequests++;
  }

  public incrementIngestions() {
    this.metrics.totalIngestions++;
  }

  public addChunksIndexed(count: number) {
    this.metrics.totalChunksIndexed += count;
  }

  public incrementLlmCalls() {
    this.metrics.totalLlmInvocations++;
  }

  public incrementErrors() {
    this.metrics.totalErrors++;
  }

  public getMetrics() {
    return { ...this.metrics };
  }
}

export const metrics = MetricsCollector.getInstance();
