export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  data?: any;
  context?: string;
}

/**
 * Logger utility for the NearFusion Shade Agent Solver
 * 
 * Provides structured logging with different levels and contexts.
 * Integrates with TEE environments for secure logging.
 */
export class Logger {
  private logLevel: LogLevel;
  private context: string;
  private logHistory: LogEntry[] = [];
  private maxHistorySize: number = 1000;

  constructor(context: string = 'Solver', logLevel: LogLevel = LogLevel.INFO) {
    this.context = context;
    this.logLevel = logLevel;
  }

  /**
   * Log error message
   */
  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Log info message
   */
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Log message with specific level
   */
  private log(level: LogLevel, message: string, data?: any): void {
    if (level > this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      data,
      context: this.context
    };

    // Add to history
    this.addToHistory(entry);

    // Output to console
    this.outputToConsole(entry);
  }

  /**
   * Add entry to log history
   */
  private addToHistory(entry: LogEntry): void {
    this.logHistory.push(entry);

    // Maintain history size limit
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }
  }

  /**
   * Output log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const levelName = LogLevel[entry.level];
    const prefix = `[${timestamp}] [${levelName}] [${entry.context}]`;
    
    let message = `${prefix} ${entry.message}`;
    
    if (entry.data !== undefined) {
      message += ` | Data: ${JSON.stringify(entry.data, null, 2)}`;
    }

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.INFO:
        console.info(message);
        break;
      case LogLevel.DEBUG:
        console.debug(message);
        break;
    }
  }

  /**
   * Create child logger with extended context
   */
  child(childContext: string): Logger {
    const fullContext = `${this.context}:${childContext}`;
    const childLogger = new Logger(fullContext, this.logLevel);
    return childLogger;
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * Get log history
   */
  getHistory(limit?: number): LogEntry[] {
    if (limit) {
      return this.logHistory.slice(-limit);
    }
    return [...this.logHistory];
  }

  /**
   * Clear log history
   */
  clearHistory(): void {
    this.logHistory = [];
  }

  /**
   * Get logs as JSON string
   */
  exportLogs(level?: LogLevel): string {
    let logs = this.logHistory;
    
    if (level !== undefined) {
      logs = logs.filter(entry => entry.level <= level);
    }
    
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Get current context
   */
  getContext(): string {
    return this.context;
  }
}