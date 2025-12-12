/**
 * Execution Tracer - Detailed logging for model inference pipeline
 *
 * Tracks every step of the inference process with timestamps, call stacks,
 * and performance metrics to ensure accurate execution.
 */

class ExecutionTracer {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.traces = [];
    this.activeSpans = new Map();
    this.startTime = null;
  }

  /**
   * Start a new trace span
   */
  startSpan(spanId, label, metadata = {}) {
    if (!this.enabled) return;

    const span = {
      id: spanId,
      label,
      metadata,
      startTime: performance.now(),
      endTime: null,
      duration: null,
      children: [],
      logs: []
    };

    this.activeSpans.set(spanId, span);
    this.log(spanId, 'START', label, metadata);

    return spanId;
  }

  /**
   * End a trace span
   */
  endSpan(spanId, metadata = {}) {
    if (!this.enabled) return;

    const span = this.activeSpans.get(spanId);
    if (!span) {
      console.warn('[Tracer] Span not found:', spanId);
      return;
    }

    span.endTime = performance.now();
    span.duration = span.endTime - span.startTime;
    span.metadata = { ...span.metadata, ...metadata };

    this.log(spanId, 'END', span.label, {
      duration: Math.round(span.duration) + 'ms',
      ...metadata
    });

    this.traces.push(span);
    this.activeSpans.delete(spanId);

    return span;
  }

  /**
   * Log an event within a span
   */
  log(spanId, level, message, data = {}) {
    if (!this.enabled) return;

    const timestamp = performance.now();
    const relativeTime = this.startTime ? timestamp - this.startTime : 0;

    const logEntry = {
      spanId,
      level,
      message,
      data,
      timestamp,
      relativeTime: Math.round(relativeTime)
    };

    const span = this.activeSpans.get(spanId);
    if (span) {
      span.logs.push(logEntry);
    }

    // Console output matching the user's log format
    const prefix = `[${spanId}]`;
    const timeStr = `+${Math.round(relativeTime)}ms`;

    let icon = '';
    switch (level) {
      case 'START': icon = '[START]'; break;
      case 'END': icon = '[END]'; break;
      case 'SUCCESS': icon = '[OK]'; break;
      case 'ERROR': icon = '[ERROR]'; break;
      case 'WARN': icon = '[WARN]'; break;
      case 'INFO': icon = '[INFO]'; break;
      default: icon = '';
    }

    const dataStr = Object.keys(data).length > 0 ? JSON.stringify(data) : '';
    console.log(`${prefix} ${icon} ${message}`, dataStr ? dataStr : '', `(${timeStr})`);
  }

  /**
   * Get execution summary
   */
  getSummary() {
    const summary = {
      totalTraces: this.traces.length,
      traces: this.traces.map(t => ({
        id: t.id,
        label: t.label,
        duration: t.duration,
        logCount: t.logs.length
      })),
      timeline: this.traces.sort((a, b) => a.startTime - b.startTime)
    };

    return summary;
  }

  /**
   * Get full trace tree
   */
  getTraceTree() {
    return {
      traces: this.traces,
      activeSpans: Array.from(this.activeSpans.entries())
    };
  }

  /**
   * Export traces for analysis
   */
  export() {
    return {
      startTime: this.startTime,
      endTime: performance.now(),
      traces: this.traces,
      summary: this.getSummary()
    };
  }

  /**
   * Reset tracer
   */
  reset() {
    this.traces = [];
    this.activeSpans.clear();
    this.startTime = performance.now();
  }

  /**
   * Enable/disable tracing
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

// Global tracer instance
export const tracer = new ExecutionTracer(true);

// Convenience functions
export function startTrace(spanId, label, metadata) {
  return tracer.startSpan(spanId, label, metadata);
}

export function endTrace(spanId, metadata) {
  return tracer.endSpan(spanId, metadata);
}

export function trace(spanId, level, message, data) {
  return tracer.log(spanId, level, message, data);
}

export function resetTracer() {
  tracer.reset();
}

export function getTraceSummary() {
  return tracer.getSummary();
}

export function exportTraces() {
  return tracer.export();
}

/**
 * Decorator for tracing async functions
 */
export function traced(spanId, label) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args) {
      const traceId = `${spanId}-${Date.now()}`;
      startTrace(traceId, `${label || propertyKey}`, { args });

      try {
        const result = await originalMethod.apply(this, args);
        endTrace(traceId, { success: true });
        return result;
      } catch (error) {
        trace(traceId, 'ERROR', error.message, { stack: error.stack });
        endTrace(traceId, { success: false, error: error.message });
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Create a traced wrapper for any function
 */
export function wrapWithTrace(fn, spanId, label) {
  return async function(...args) {
    const traceId = `${spanId}-${Date.now()}`;
    startTrace(traceId, label || fn.name, { args: args.map(a => typeof a) });

    try {
      const result = await fn.apply(this, args);
      endTrace(traceId, { success: true });
      return result;
    } catch (error) {
      trace(traceId, 'ERROR', error.message, { stack: error.stack });
      endTrace(traceId, { success: false, error: error.message });
      throw error;
    }
  };
}
