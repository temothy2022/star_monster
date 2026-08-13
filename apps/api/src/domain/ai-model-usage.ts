export type AiModelCallRecord = {
  provider: string;
  operation: string;
  model: string;
  status: string;
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  createdAt: Date;
};

type ProviderSummary = {
  provider: string;
  calls: number;
  success: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  averageDurationMs: number | null;
};

type TrendRow = {
  date: string;
  calls: number;
  success: number;
  failed: number;
  deepseek: number;
  minimax: number;
};

function dateKey(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function addDays(value: Date, amount: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function round(value: number | null) {
  return value === null ? null : Math.round(value * 10) / 10;
}

function emptyProvider(provider: string): ProviderSummary {
  return {
    provider,
    calls: 0,
    success: 0,
    failed: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    averageDurationMs: null,
  };
}

export function buildAiModelUsageDashboard(
  records: AiModelCallRecord[],
  days: number,
  now = new Date(),
  timeZone = "Asia/Shanghai",
) {
  const providers = new Map<string, ProviderSummary>();
  const operations = new Map<string, {
    provider: string;
    operation: string;
    model: string;
    calls: number;
    success: number;
    failed: number;
    totalTokens: number;
    durationTotal: number;
    lastCalledAt: Date;
  }>();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);

  for (const record of records) {
    const provider = providers.get(record.provider) ?? emptyProvider(record.provider);
    provider.calls += 1;
    if (record.status === "SUCCESS") provider.success += 1;
    else provider.failed += 1;
    provider.promptTokens += record.promptTokens ?? 0;
    provider.completionTokens += record.completionTokens ?? 0;
    provider.totalTokens += record.totalTokens ?? 0;
    const durationCount = provider.calls;
    provider.averageDurationMs = round(
      ((provider.averageDurationMs ?? 0) * (durationCount - 1) + record.durationMs) / durationCount,
    );
    providers.set(record.provider, provider);

    const operationKey = `${record.provider}\u0000${record.operation}\u0000${record.model}`;
    const operation = operations.get(operationKey) ?? {
      provider: record.provider,
      operation: record.operation,
      model: record.model,
      calls: 0,
      success: 0,
      failed: 0,
      totalTokens: 0,
      durationTotal: 0,
      lastCalledAt: record.createdAt,
    };
    operation.calls += 1;
    if (record.status === "SUCCESS") operation.success += 1;
    else operation.failed += 1;
    operation.totalTokens += record.totalTokens ?? 0;
    operation.durationTotal += record.durationMs;
    if (record.createdAt > operation.lastCalledAt) operation.lastCalledAt = record.createdAt;
    operations.set(operationKey, operation);
  }

  const trends = new Map<string, TrendRow>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const key = dateKey(addDays(now, -offset), timeZone);
    trends.set(key, { date: key, calls: 0, success: 0, failed: 0, deepseek: 0, minimax: 0 });
  }
  for (const record of records) {
    if (record.createdAt < from) continue;
    const key = dateKey(record.createdAt, timeZone);
    const trend = trends.get(key);
    if (!trend) continue;
    trend.calls += 1;
    if (record.status === "SUCCESS") trend.success += 1;
    else trend.failed += 1;
    if (record.provider === "DEEPSEEK") trend.deepseek += 1;
    if (record.provider === "MINIMAX") trend.minimax += 1;
  }

  const providerRows = [...providers.values()].sort((left, right) => {
    const order = ["DEEPSEEK", "MINIMAX"];
    return (order.indexOf(left.provider) < 0 ? 99 : order.indexOf(left.provider)) -
      (order.indexOf(right.provider) < 0 ? 99 : order.indexOf(right.provider));
  });
  const totalCalls = providerRows.reduce((sum, row) => sum + row.calls, 0);
  const totalSuccess = providerRows.reduce((sum, row) => sum + row.success, 0);
  const totalFailed = providerRows.reduce((sum, row) => sum + row.failed, 0);
  const totalTokens = providerRows.reduce((sum, row) => sum + row.totalTokens, 0);

  return {
    days,
    collectedFrom: records.length ? new Date(Math.min(...records.map((record) => record.createdAt.getTime()))).toISOString() : null,
    collectedTo: records.length ? new Date(Math.max(...records.map((record) => record.createdAt.getTime()))).toISOString() : null,
    totals: {
      calls: totalCalls,
      success: totalSuccess,
      failed: totalFailed,
      totalTokens,
      successRate: totalCalls ? Math.round((totalSuccess / totalCalls) * 1000) / 10 : null,
    },
    providers: providerRows,
    trend: [...trends.values()],
    operations: [...operations.values()]
      .map((operation) => ({
        provider: operation.provider,
        operation: operation.operation,
        model: operation.model,
        calls: operation.calls,
        success: operation.success,
        failed: operation.failed,
        totalTokens: operation.totalTokens,
        averageDurationMs: round(operation.durationTotal / operation.calls),
        lastCalledAt: operation.lastCalledAt.toISOString(),
      }))
      .sort((left, right) => right.calls - left.calls),
  };
}
