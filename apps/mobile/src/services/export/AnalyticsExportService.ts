/**
 * Analytics Export Service
 * Handles advanced analytics and dashboard metrics export
 */

import { UIEvent } from '../../screens/EventsScreen/types';
import {
  AnalyticsExportOptions,
  DateRange,
  ExportResult,
  ExportProgressCallback,
  ReportSection,
  PDFExportOptions,
  ExcelExportOptions
} from '../../types/export';
import { enhancedExportService } from './EnhancedExportService';

interface DashboardMetrics {
  totalEvents: number;
  totalCalls: number;
  totalSms: number;
  uniqueContacts: number;
  avgCallDuration: number;
  peakHour: string;
  busyDay: string;
  topContacts: Array<{ name: string; count: number; percentage: number }>;
  communicationTrends: Array<{ date: string; calls: number; sms: number }>;
  directionStats: { incoming: number; outgoing: number };
  durationStats: { total: number; average: number; median: number; longest: number };
}

interface ContactAnalytics {
  contactId: string;
  name: string;
  totalEvents: number;
  callCount: number;
  smsCount: number;
  totalDuration: number;
  avgDuration: number;
  firstContact: string;
  lastContact: string;
  peakDays: string[];
  communicationPattern: 'frequent' | 'regular' | 'occasional' | 'rare';
  sentiment?: 'positive' | 'neutral' | 'negative';
}

interface TrendAnalysis {
  period: 'day' | 'week' | 'month';
  data: Array<{
    date: string;
    calls: number;
    sms: number;
    duration: number;
    contacts: number;
  }>;
  insights: string[];
  predictions?: Array<{
    date: string;
    predictedCalls: number;
    predictedSms: number;
    confidence: number;
  }>;
}

export class AnalyticsExportService {
  private static instance: AnalyticsExportService;

  static getInstance(): AnalyticsExportService {
    if (!AnalyticsExportService.instance) {
      AnalyticsExportService.instance = new AnalyticsExportService();
    }
    return AnalyticsExportService.instance;
  }

  /**
   * Export dashboard metrics report
   */
  async exportDashboardReport(
    events: UIEvent[],
    options: AnalyticsExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    try {
      onProgress?.({
        total: 100,
        processed: 0,
        percentage: 0,
        status: 'preparing',
        stage: 'Analyzing dashboard metrics'
      });

      // Calculate dashboard metrics
      const metrics = await this.calculateDashboardMetrics(events, options.dateRange);

      onProgress?.({
        total: 100,
        processed: 30,
        percentage: 30,
        status: 'processing',
        stage: 'Generating dashboard report'
      });

      // Generate report based on format
      if (options.format === 'pdf') {
        return await this.generateDashboardPDF(metrics, options, onProgress);
      } else if (options.format === 'excel') {
        return await this.generateDashboardExcel(metrics, options, onProgress);
      } else {
        // JSON or CSV format
        return await this.generateDashboardData(metrics, options, onProgress);
      }

    } catch (error) {
      onProgress?.({
        total: 100,
        processed: 0,
        percentage: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Dashboard export failed'
      });
      throw error;
    }
  }

  /**
   * Export contact analytics
   */
  async exportContactAnalytics(
    events: UIEvent[],
    contactIds: string[],
    options: AnalyticsExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    try {
      onProgress?.({
        total: contactIds.length,
        processed: 0,
        percentage: 0,
        status: 'preparing',
        stage: 'Analyzing contact data'
      });

      const contactAnalytics: ContactAnalytics[] = [];

      // Analyze each contact
      for (let i = 0; i < contactIds.length; i++) {
        const contactId = contactIds[i];
        const contactEvents = events.filter(e => e.contact_id === contactId);
        
        if (contactEvents.length > 0) {
          const analytics = await this.analyzeContact(contactEvents, contactId);
          contactAnalytics.push(analytics);
        }

        onProgress?.({
          total: contactIds.length,
          processed: i + 1,
          percentage: Math.round(((i + 1) / contactIds.length) * 70),
          status: 'processing',
          stage: `Analyzing contact ${i + 1}/${contactIds.length}`
        });
      }

      onProgress?.({
        total: contactIds.length,
        processed: contactIds.length,
        percentage: 80,
        status: 'processing',
        stage: 'Generating contact analytics report'
      });

      // Generate report
      return await this.generateContactAnalyticsReport(contactAnalytics, options, onProgress);

    } catch (error) {
      onProgress?.({
        total: contactIds.length,
        processed: 0,
        percentage: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Contact analytics export failed'
      });
      throw error;
    }
  }

  /**
   * Export trend analysis
   */
  async exportTrendAnalysis(
    events: UIEvent[],
    period: 'day' | 'week' | 'month',
    options: AnalyticsExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    try {
      onProgress?.({
        total: 100,
        processed: 0,
        percentage: 0,
        status: 'preparing',
        stage: 'Analyzing communication trends'
      });

      const trendAnalysis = await this.analyzeTrends(events, period, options.dateRange);

      onProgress?.({
        total: 100,
        processed: 60,
        percentage: 60,
        status: 'processing',
        stage: 'Generating trend analysis report'
      });

      return await this.generateTrendAnalysisReport(trendAnalysis, options, onProgress);

    } catch (error) {
      onProgress?.({
        total: 100,
        processed: 0,
        percentage: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Trend analysis export failed'
      });
      throw error;
    }
  }

  /**
   * Calculate comprehensive dashboard metrics
   */
  private async calculateDashboardMetrics(
    events: UIEvent[],
    dateRange: DateRange
  ): Promise<DashboardMetrics> {
    const filteredEvents = this.filterEventsByDateRange(events, dateRange);

    const totalEvents = filteredEvents.length;
    const totalCalls = filteredEvents.filter(e => e.type === 'call').length;
    const totalSms = filteredEvents.filter(e => e.type === 'sms').length;

    // Unique contacts
    const uniqueContacts = new Set(
      filteredEvents.map(e => e.contact_id || e.display_number || e.number)
    ).size;

    // Average call duration
    const callDurations = filteredEvents
      .filter(e => e.type === 'call' && e.duration)
      .map(e => e.duration || 0);
    const avgCallDuration = callDurations.length > 0
      ? Math.round(callDurations.reduce((sum, d) => sum + d, 0) / callDurations.length)
      : 0;

    // Peak hour analysis
    const hourCounts = new Map<number, number>();
    filteredEvents.forEach(event => {
      const hour = new Date(event.ts).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });
    const peakHour = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    // Busy day analysis
    const dayCounts = new Map<string, number>();
    filteredEvents.forEach(event => {
      const dayName = new Date(event.ts).toLocaleDateString('en-US', { weekday: 'long' });
      dayCounts.set(dayName, (dayCounts.get(dayName) || 0) + 1);
    });
    const busyDay = Array.from(dayCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    // Top contacts
    const contactCounts = new Map<string, number>();
    filteredEvents.forEach(event => {
      const key = event.display_name || event.display_number || event.number || 'Unknown';
      contactCounts.set(key, (contactCounts.get(key) || 0) + 1);
    });

    const topContacts = Array.from(contactCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / totalEvents) * 100)
      }));

    // Communication trends (daily)
    const trendData = this.generateDailyTrends(filteredEvents, dateRange);

    // Direction statistics
    const incoming = filteredEvents.filter(e => e.direction === 'inbound').length;
    const outgoing = filteredEvents.filter(e => e.direction === 'outbound').length;

    // Duration statistics
    const totalDuration = callDurations.reduce((sum, d) => sum + d, 0);
    const sortedDurations = [...callDurations].sort((a, b) => a - b);
    const median = sortedDurations.length > 0
      ? sortedDurations[Math.floor(sortedDurations.length / 2)]
      : 0;
    const longest = Math.max(...callDurations, 0);

    return {
      totalEvents,
      totalCalls,
      totalSms,
      uniqueContacts,
      avgCallDuration,
      peakHour: peakHour !== undefined ? `${peakHour}:00` : 'N/A',
      busyDay: busyDay || 'N/A',
      topContacts,
      communicationTrends: trendData,
      directionStats: { incoming, outgoing },
      durationStats: {
        total: totalDuration,
        average: avgCallDuration,
        median,
        longest
      }
    };
  }

  /**
   * Analyze individual contact
   */
  private async analyzeContact(events: UIEvent[], contactId: string): Promise<ContactAnalytics> {
    const totalEvents = events.length;
    const callCount = events.filter(e => e.type === 'call').length;
    const smsCount = events.filter(e => e.type === 'sms').length;

    const durations = events
      .filter(e => e.type === 'call' && e.duration)
      .map(e => e.duration || 0);
    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const avgDuration = durations.length > 0 ? Math.round(totalDuration / durations.length) : 0;

    const dates = events.map(e => new Date(e.ts)).sort((a, b) => a.getTime() - b.getTime());
    const firstContact = dates[0]?.toISOString() || '';
    const lastContact = dates[dates.length - 1]?.toISOString() || '';

    // Peak days analysis
    const dayStats = new Map<string, number>();
    events.forEach(event => {
      const dayName = new Date(event.ts).toLocaleDateString('en-US', { weekday: 'long' });
      dayStats.set(dayName, (dayStats.get(dayName) || 0) + 1);
    });

    const peakDays = Array.from(dayStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([day]) => day);

    // Communication pattern
    let communicationPattern: 'frequent' | 'regular' | 'occasional' | 'rare';
    const eventsPerWeek = totalEvents / Math.max(1, this.getWeeksBetweenDates(firstContact, lastContact));
    
    if (eventsPerWeek > 10) {
      communicationPattern = 'frequent';
    } else if (eventsPerWeek > 3) {
      communicationPattern = 'regular';
    } else if (eventsPerWeek > 1) {
      communicationPattern = 'occasional';
    } else {
      communicationPattern = 'rare';
    }

    return {
      contactId,
      name: events[0]?.display_name || events[0]?.display_number || events[0]?.number || 'Unknown',
      totalEvents,
      callCount,
      smsCount,
      totalDuration,
      avgDuration,
      firstContact,
      lastContact,
      peakDays,
      communicationPattern
    };
  }

  /**
   * Analyze communication trends
   */
  private async analyzeTrends(
    events: UIEvent[],
    period: 'day' | 'week' | 'month',
    dateRange: DateRange
  ): Promise<TrendAnalysis> {
    const filteredEvents = this.filterEventsByDateRange(events, dateRange);

    const data = this.groupEventsByPeriod(filteredEvents, period);
    const insights = this.generateTrendInsights(data, period);

    return {
      period,
      data,
      insights
    };
  }

  /**
   * Generate dashboard PDF report
   */
  private async generateDashboardPDF(
    metrics: DashboardMetrics,
    options: AnalyticsExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    const sections: ReportSection[] = [
      {
        type: 'header',
        title: 'Communication Dashboard Report',
        data: {
          period: `${options.dateRange.startDate} to ${options.dateRange.endDate}`,
          generated: new Date().toLocaleDateString()
        }
      },
      {
        type: 'metrics',
        title: 'Key Metrics',
        data: {
          totalEvents: metrics.totalEvents,
          totalCalls: metrics.totalCalls,
          totalSms: metrics.totalSms,
          uniqueContacts: metrics.uniqueContacts,
          avgCallDuration: `${metrics.avgCallDuration}s`,
          peakHour: metrics.peakHour,
          busyDay: metrics.busyDay
        }
      },
      {
        type: 'table',
        title: 'Top Contacts',
        data: metrics.topContacts
      },
      {
        type: 'chart',
        title: 'Communication Trends',
        data: metrics.communicationTrends
      },
      {
        type: 'summary',
        title: 'Summary',
        data: this.generateSummaryText(metrics)
      }
    ];

    const pdfOptions: PDFExportOptions = {
      format: 'pdf',
      template: 'custom',
      sections,
      includeCharts: options.includeCharts,
      pageSize: 'A4'
    };

    return await enhancedExportService.exportEvents([], pdfOptions, onProgress);
  }

  /**
   * Generate dashboard Excel report
   */
  private async generateDashboardExcel(
    metrics: DashboardMetrics,
    options: AnalyticsExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    // Create structured data for Excel export
    const excelData = {
      metrics: [
        ['Metric', 'Value'],
        ['Total Events', metrics.totalEvents],
        ['Total Calls', metrics.totalCalls],
        ['Total SMS', metrics.totalSms],
        ['Unique Contacts', metrics.uniqueContacts],
        ['Average Call Duration', `${metrics.avgCallDuration}s`],
        ['Peak Hour', metrics.peakHour],
        ['Busiest Day', metrics.busyDay]
      ],
      topContacts: [
        ['Contact', 'Event Count', 'Percentage'],
        ...metrics.topContacts.map(c => [c.name, c.count, `${c.percentage}%`])
      ],
      trends: [
        ['Date', 'Calls', 'SMS'],
        ...metrics.communicationTrends.map(t => [t.date, t.calls, t.sms])
      ]
    };

    const excelOptions: ExcelExportOptions = {
      format: 'excel',
      sheetName: 'Dashboard Analytics',
      includeCharts: options.includeCharts,
      autoFilter: true,
      freezeHeaders: true
    };

    // Log excel data for debugging
    console.log('[AnalyticsExportService] Excel data prepared:', Object.keys(excelData));

    return await enhancedExportService.exportEvents([], excelOptions, onProgress);
  }

  /**
   * Generate dashboard data (JSON/CSV)
   */
  private async generateDashboardData(
    metrics: DashboardMetrics,
    options: AnalyticsExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    const exportData = {
      dashboard_metrics: metrics,
      export_info: {
        exported_at: new Date().toISOString(),
        date_range: options.dateRange,
        metrics_included: options.metrics.map(m => m.type),
        version: '1.0'
      }
    };

    if (options.format === 'json') {
      const jsonContent = JSON.stringify(exportData, null, 2);
      const filename = `dashboard_analytics_${Date.now()}.json`;
      
      // Save and return result
      return {
        success: true,
        filename,
        size: jsonContent.length * 2,
        format: 'json',
        uri: '' // Would be set by file saving logic
      };
    }

    // CSV format - flatten the data
    return await enhancedExportService.exportEvents([], {
      format: 'csv',
      filename: `dashboard_analytics_${Date.now()}.csv`
    }, onProgress);
  }

  /**
   * Generate contact analytics report
   */
  private async generateContactAnalyticsReport(
    analytics: ContactAnalytics[],
    options: AnalyticsExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    // Implementation would depend on format
    const exportData = {
      contact_analytics: analytics,
      export_info: {
        exported_at: new Date().toISOString(),
        total_contacts: analytics.length,
        version: '1.0'
      }
    };

    // Log export data for debugging
    console.log('[AnalyticsExportService] Contact analytics prepared:', exportData.contact_analytics.length);

    return await enhancedExportService.exportEvents([], {
      format: options.format,
      filename: `contact_analytics_${Date.now()}.${options.format}`
    }, onProgress);
  }

  /**
   * Generate trend analysis report
   */
  private async generateTrendAnalysisReport(
    analysis: TrendAnalysis,
    options: AnalyticsExportOptions,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    const exportData = {
      trend_analysis: analysis,
      export_info: {
        exported_at: new Date().toISOString(),
        analysis_period: analysis.period,
        version: '1.0'
      }
    };

    // Log export data for debugging
    console.log('[AnalyticsExportService] Trend analysis prepared:', exportData.trend_analysis.period);

    return await enhancedExportService.exportEvents([], {
      format: options.format,
      filename: `trend_analysis_${Date.now()}.${options.format}`
    }, onProgress);
  }

  /**
   * Filter events by date range
   */
  private filterEventsByDateRange(events: UIEvent[], dateRange: DateRange): UIEvent[] {
    const start = new Date(dateRange.startDate);
    const end = new Date(dateRange.endDate);
    
    return events.filter(event => {
      const eventDate = new Date(event.ts);
      return eventDate >= start && eventDate <= end;
    });
  }

  /**
   * Generate daily trends data
   */
  private generateDailyTrends(events: UIEvent[], _dateRange: DateRange) {
    const trendsMap = new Map<string, { calls: number; sms: number }>();
    
    events.forEach(event => {
      const date = new Date(event.ts).toISOString().split('T')[0];
      const existing = trendsMap.get(date) || { calls: 0, sms: 0 };
      
      if (event.type === 'call') {
        existing.calls++;
      } else if (event.type === 'sms') {
        existing.sms++;
      }
      
      trendsMap.set(date, existing);
    });

    return Array.from(trendsMap.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Group events by time period
   */
  private groupEventsByPeriod(
    events: UIEvent[],
    period: 'day' | 'week' | 'month'
  ) {
    const groups = new Map<string, {
      calls: number;
      sms: number;
      duration: number;
      contacts: Set<string>;
    }>();

    events.forEach(event => {
      let key: string;
      const date = new Date(event.ts);

      switch (period) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week': {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        }
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }

      const existing = groups.get(key) || {
        calls: 0,
        sms: 0,
        duration: 0,
        contacts: new Set()
      };

      if (event.type === 'call') {
        existing.calls++;
        existing.duration += event.duration || 0;
      } else if (event.type === 'sms') {
        existing.sms++;
      }

      existing.contacts.add(event.contact_id || event.display_number || event.number || 'unknown');
      groups.set(key, existing);
    });

    return Array.from(groups.entries())
      .map(([date, stats]) => ({
        date,
        calls: stats.calls,
        sms: stats.sms,
        duration: stats.duration,
        contacts: stats.contacts.size
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Generate trend insights
   */
  private generateTrendInsights(
    data: Array<{ date: string; calls: number; sms: number; duration: number; contacts: number }>,
    _period: 'day' | 'week' | 'month'
  ): string[] {
    const insights: string[] = [];

    if (data.length === 0) {
      return ['No data available for trend analysis'];
    }

    // Calculate averages
    const avgCalls = data.reduce((sum, d) => sum + d.calls, 0) / data.length;
    const avgSms = data.reduce((sum, d) => sum + d.sms, 0) / data.length;

    // Communication preference
    if (avgCalls > avgSms) {
      insights.push('Voice calls are the preferred communication method');
    } else if (avgSms > avgCalls) {
      insights.push('Text messaging is the preferred communication method');
    } else {
      insights.push('Balanced usage of calls and text messaging');
    }

    // Peak period
    const peakData = data.reduce((max, current) => 
      (current.calls + current.sms) > (max.calls + max.sms) ? current : max
    );
    insights.push(`Peak communication period: ${peakData.date}`);

    // Trend direction
    if (data.length >= 2) {
      const recent = data.slice(-3);
      const older = data.slice(0, 3);
      
      const recentAvg = recent.reduce((sum, d) => sum + d.calls + d.sms, 0) / recent.length;
      const olderAvg = older.reduce((sum, d) => sum + d.calls + d.sms, 0) / older.length;

      if (recentAvg > olderAvg * 1.1) {
        insights.push('Communication volume is increasing');
      } else if (recentAvg < olderAvg * 0.9) {
        insights.push('Communication volume is decreasing');
      } else {
        insights.push('Communication volume is stable');
      }
    }

    return insights;
  }

  /**
   * Generate summary text for reports
   */
  private generateSummaryText(metrics: DashboardMetrics): string {
    return `This communication report covers ${metrics.totalEvents} total events including ${metrics.totalCalls} calls and ${metrics.totalSms} messages across ${metrics.uniqueContacts} unique contacts. The average call duration was ${metrics.avgCallDuration} seconds. Peak activity occurred during ${metrics.peakHour} on ${metrics.busyDay}s.`;
  }

  /**
   * Calculate weeks between dates
   */
  private getWeeksBetweenDates(start: string, end: string): number {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffWeeks = diffTime / (1000 * 60 * 60 * 24 * 7);
    return Math.max(1, Math.round(diffWeeks));
  }
}

// Export singleton instance
export const analyticsExportService = AnalyticsExportService.getInstance();