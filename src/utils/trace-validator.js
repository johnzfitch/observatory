/**
 * Trace Validator - Validates execution traces against expected patterns
 *
 * Ensures the inference pipeline executes correctly by checking:
 * - Order of operations
 * - Required steps completed
 * - Performance within acceptable range
 * - No unexpected errors
 */

export class TraceValidator {
  constructor(traces) {
    this.traces = traces;
    this.violations = [];
    this.warnings = [];
  }

  /**
   * Validate full execution trace
   */
  validate() {
    this.violations = [];
    this.warnings = [];

    this.validateExecutionOrder();
    this.validateRequiredSteps();
    this.validatePerformance();
    this.validateErrorHandling();
    this.validateDataFlow();

    return {
      valid: this.violations.length === 0,
      violations: this.violations,
      warnings: this.warnings,
      summary: this.getSummary()
    };
  }

  /**
   * Check operations happen in correct order
   */
  validateExecutionOrder() {
    const expectedOrder = [
      'ONNX-Init',
      'InferenceEngine',
      'model-load',
      'inference',
      'predict',
      'classifier'
    ];

    const actualOrder = this.traces
      .filter(t => t.logs.some(l => l.level === 'START'))
      .map(t => this.categorizeSpan(t.id));

    for (let i = 1; i < expectedOrder.length; i++) {
      const expectedPhase = expectedOrder[i];
      const previousPhase = expectedOrder[i - 1];

      const expectedIdx = actualOrder.indexOf(expectedPhase);
      const previousIdx = actualOrder.indexOf(previousPhase);

      if (expectedIdx >= 0 && previousIdx >= 0 && expectedIdx < previousIdx) {
        this.violations.push({
          type: 'ORDER_VIOLATION',
          message: `${expectedPhase} executed before ${previousPhase}`,
          severity: 'ERROR'
        });
      }
    }
  }

  /**
   * Check all required steps completed
   */
  validateRequiredSteps() {
    const requiredSteps = [
      { pattern: /ONNX.*Init/, name: 'ONNX Initialization' },
      { pattern: /InferenceEngine.*Init/, name: 'InferenceEngine Init' },
      { pattern: /Importing transformers/, name: 'Transformers.js Import' },
      { pattern: /Environment configured/, name: 'Environment Config' },
      { pattern: /Pipeline created/, name: 'Pipeline Creation' },
      { pattern: /Running classifier/, name: 'Classifier Execution' },
      { pattern: /Classifier returned/, name: 'Classifier Results' }
    ];

    const allLogs = this.traces.flatMap(t => t.logs.map(l => l.message));

    for (const step of requiredSteps) {
      const found = allLogs.some(log => step.pattern.test(log));
      if (!found) {
        this.violations.push({
          type: 'MISSING_STEP',
          message: `Required step not found: ${step.name}`,
          severity: 'ERROR'
        });
      }
    }
  }

  /**
   * Check performance is within acceptable range
   */
  validatePerformance() {
    const performanceThresholds = {
      modelLoad: 5000,    // 5 seconds max for first load
      inference: 2000,    // 2 seconds max per inference
      total: 10000        // 10 seconds max total
    };

    for (const trace of this.traces) {
      const category = this.categorizeSpan(trace.id);

      if (category === 'model-load' && trace.duration > performanceThresholds.modelLoad) {
        this.warnings.push({
          type: 'SLOW_OPERATION',
          message: `Model load took ${Math.round(trace.duration)}ms (threshold: ${performanceThresholds.modelLoad}ms)`,
          severity: 'WARN',
          span: trace.id
        });
      }

      if (category === 'inference' && trace.duration > performanceThresholds.inference) {
        this.warnings.push({
          type: 'SLOW_OPERATION',
          message: `Inference took ${Math.round(trace.duration)}ms (threshold: ${performanceThresholds.inference}ms)`,
          severity: 'WARN',
          span: trace.id
        });
      }
    }

    const totalDuration = this.traces.reduce((sum, t) => sum + (t.duration || 0), 0);
    if (totalDuration > performanceThresholds.total) {
      this.warnings.push({
        type: 'SLOW_TOTAL',
        message: `Total execution took ${Math.round(totalDuration)}ms (threshold: ${performanceThresholds.total}ms)`,
        severity: 'WARN'
      });
    }
  }

  /**
   * Check error handling
   */
  validateErrorHandling() {
    for (const trace of this.traces) {
      const errors = trace.logs.filter(l => l.level === 'ERROR');

      if (errors.length > 0) {
        // Check if error was handled (followed by recovery or proper end)
        const hasRecovery = trace.logs.some(l =>
          l.message.includes('retry') ||
          l.message.includes('fallback') ||
          l.message.includes('recovered')
        );

        if (!hasRecovery) {
          this.violations.push({
            type: 'UNHANDLED_ERROR',
            message: `Error in ${trace.id} was not handled: ${errors[0].message}`,
            severity: 'ERROR',
            span: trace.id
          });
        }
      }
    }
  }

  /**
   * Check data flows correctly through pipeline
   */
  validateDataFlow() {
    // Check Blob → data URL conversion
    const predictLogs = this.traces
      .filter(t => t.id.includes('dima806') || t.id.includes('model'))
      .flatMap(t => t.logs);

    const hasBlobInput = predictLogs.some(l => l.message.includes('Blob'));
    const hasDataURL = predictLogs.some(l => l.message.includes('data URL') || l.message.includes('String'));

    if (hasBlobInput && !hasDataURL) {
      this.violations.push({
        type: 'DATA_FORMAT_ERROR',
        message: 'Blob input detected but no data URL conversion found',
        severity: 'ERROR'
      });
    }

    // Check result format
    const resultLogs = predictLogs.filter(l => l.message.includes('aiProbability'));
    for (const log of resultLogs) {
      const match = log.message.match(/aiProbability[:\s]+(\d+\.?\d*)/);
      if (match) {
        const value = parseFloat(match[1]);
        if (value > 100) {
          this.violations.push({
            type: 'INVALID_RESULT',
            message: `aiProbability ${value} exceeds 100 (should be percentage 0-100)`,
            severity: 'ERROR'
          });
        }
        if (value < 1 && value > 0) {
          this.warnings.push({
            type: 'SUSPICIOUS_RESULT',
            message: `aiProbability ${value} looks like decimal (should be percentage 0-100)`,
            severity: 'WARN'
          });
        }
      }
    }
  }

  /**
   * Categorize span by ID
   */
  categorizeSpan(spanId) {
    if (spanId.includes('onnx') || spanId.includes('ONNX')) return 'ONNX-Init';
    if (spanId.includes('InferenceEngine')) return 'InferenceEngine';
    if (spanId.includes('load') || spanId.includes('Load')) return 'model-load';
    if (spanId.includes('inference')) return 'inference';
    if (spanId.includes('predict')) return 'predict';
    if (spanId.includes('classifier')) return 'classifier';
    return 'other';
  }

  /**
   * Get validation summary
   */
  getSummary() {
    return {
      totalViolations: this.violations.length,
      totalWarnings: this.warnings.length,
      errorViolations: this.violations.filter(v => v.severity === 'ERROR').length,
      criticalViolations: this.violations.filter(v => v.severity === 'CRITICAL').length,
      passRate: this.traces.length > 0 ?
        Math.round((1 - this.violations.length / this.traces.length) * 100) : 0
    };
  }

  /**
   * Generate detailed report
   */
  generateReport() {
    const report = [];

    report.push('='.repeat(70));
    report.push('TRACE VALIDATION REPORT');
    report.push('='.repeat(70));
    report.push('');

    const summary = this.getSummary();
    report.push(`Total Traces: ${this.traces.length}`);
    report.push(`Violations: ${summary.totalViolations} (${summary.errorViolations} errors)`);
    report.push(`Warnings: ${summary.totalWarnings}`);
    report.push(`Pass Rate: ${summary.passRate}%`);
    report.push('');

    if (this.violations.length > 0) {
      report.push('VIOLATIONS:');
      report.push('-'.repeat(70));
      for (const violation of this.violations) {
        report.push(`[${violation.severity}] ${violation.type}: ${violation.message}`);
        if (violation.span) report.push(`  Span: ${violation.span}`);
      }
      report.push('');
    }

    if (this.warnings.length > 0) {
      report.push('WARNINGS:');
      report.push('-'.repeat(70));
      for (const warning of this.warnings) {
        report.push(`[${warning.severity}] ${warning.type}: ${warning.message}`);
        if (warning.span) report.push(`  Span: ${warning.span}`);
      }
      report.push('');
    }

    if (this.violations.length === 0 && this.warnings.length === 0) {
      report.push('✅ ALL CHECKS PASSED - EXECUTION IS VALID');
    }

    report.push('='.repeat(70));

    return report.join('\n');
  }
}

/**
 * Convenience function to validate traces
 */
export function validateTraces(traces) {
  const validator = new TraceValidator(traces);
  const result = validator.validate();
  console.log(validator.generateReport());
  return result;
}
