// Heatmap Data Access Layer
// Provides convenience methods for retrieving and processing heatmap data

import { supabase, db } from './client'
import type { 
  HeatmapDataPoint, 
  HeatmapViewMode, 
  HeatmapParams,
  HeatmapSummary,
  EventType 
} from './types'

/**
 * Retrieves heatmap data with time bucket aggregation
 * 
 * @param params - Parameters for the heatmap query
 * @returns Promise containing heatmap data points
 */
export const getHeatmapData = async (params: HeatmapParams): Promise<{
  data: HeatmapDataPoint[] | null
  error: any
}> => {
  const {
    user_id,
    view_mode = 'weekly',
    event_types = ['call', 'sms'],
    start_date,
    end_date
  } = params

  // Validate view mode
  if (!['daily', 'weekly', 'monthly'].includes(view_mode)) {
    return {
      data: null,
      error: { message: 'Invalid view mode. Must be daily, weekly, or monthly' }
    }
  }

  // Set default date range if not provided (last 30 days)
  const defaultEndDate = new Date().toISOString()
  const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const rpcParams = {
    p_user_id: user_id,
    p_view_mode: view_mode,
    p_event_types: event_types,
    p_start_date: start_date || defaultStartDate,
    p_end_date: end_date || defaultEndDate
  }

  return db.rpc<HeatmapDataPoint[]>('get_heatmap_data', rpcParams)
}

/**
 * Retrieves heatmap summary statistics
 * 
 * @param user_id - User ID to get summary for
 * @param start_date - Optional start date (ISO string)
 * @param end_date - Optional end date (ISO string)
 * @returns Promise containing heatmap summary
 */
export const getHeatmapSummary = async (
  user_id: string,
  start_date?: string,
  end_date?: string
): Promise<{
  data: HeatmapSummary | null
  error: any
}> => {
  const defaultEndDate = new Date().toISOString()
  const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const rpcParams = {
    p_user_id: user_id,
    p_start_date: start_date || defaultStartDate,
    p_end_date: end_date || defaultEndDate
  }

  return db.rpc<HeatmapSummary>('get_heatmap_summary', rpcParams)
}

/**
 * Utility to format time buckets for display
 * 
 * @param timeBucket - Time bucket string from database
 * @param viewMode - View mode used to generate the data
 * @returns Formatted display string
 */
export const formatTimeBucket = (timeBucket: string, viewMode: HeatmapViewMode): string => {
  const date = new Date(timeBucket)
  
  switch (viewMode) {
    case 'daily':
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        hour12: true
      })
    case 'weekly':
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        hour12: true
      })
    case 'monthly':
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    default:
      return timeBucket
  }
}

/**
 * Utility to get day of week name from day number
 * 
 * @param dayOfWeek - Day number (0 = Sunday, 6 = Saturday)
 * @returns Day name
 */
export const getDayName = (dayOfWeek: number): string => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return days[dayOfWeek] || 'Unknown'
}

/**
 * Utility to format hour of day for display
 * 
 * @param hour - Hour in 24-hour format (0-23)
 * @returns Formatted hour string
 */
export const formatHour = (hour: number): string => {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  if (hour < 12) return `${hour} AM`
  return `${hour - 12} PM`
}

/**
 * Utility to format call duration in human-readable format
 * 
 * @param totalSeconds - Duration in seconds
 * @returns Formatted duration string
 */
export const formatDuration = (totalSeconds: number): string => {
  if (totalSeconds === 0) return '0s'
  
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0 && hours === 0) parts.push(`${seconds}s`)

  return parts.join(' ')
}

/**
 * Utility to calculate intensity color for heatmap visualization
 * 
 * @param intensity - Intensity value (0.0 to 1.0)
 * @returns CSS color value
 */
export const getIntensityColor = (intensity: number): string => {
  // Ensure intensity is between 0 and 1
  const normalizedIntensity = Math.max(0, Math.min(1, intensity))
  
  if (normalizedIntensity === 0) return '#f3f4f6' // Gray-100 for no activity
  
  // Use a blue color scale for activity intensity
  const baseBlue = 59 // HSL Blue hue
  const saturation = 80 + (20 * normalizedIntensity) // 80% to 100%
  const lightness = 95 - (45 * normalizedIntensity) // 95% to 50%
  
  return `hsl(${baseBlue}, ${saturation}%, ${lightness}%)`
}

/**
 * Process heatmap data for visualization components
 * 
 * @param data - Raw heatmap data from database
 * @param viewMode - View mode used
 * @returns Processed data suitable for charts/grids
 */
export const processHeatmapForVisualization = (
  data: HeatmapDataPoint[],
  viewMode: HeatmapViewMode
) => {
  // Create a matrix structure for easier visualization
  const matrix: Record<string, Record<string, HeatmapDataPoint>> = {}
  let maxIntensity = 0

  // Group data by day of week and hour
  for (const point of data) {
    const dayKey = point.day_of_week.toString()
    const hourKey = point.hour_of_day.toString()
    
    if (!matrix[dayKey]) {
      matrix[dayKey] = {}
    }
    
    matrix[dayKey][hourKey] = point
    maxIntensity = Math.max(maxIntensity, point.intensity)
  }

  // Generate complete grid with empty cells
  const days = Array.from({ length: 7 }, (_, i) => i) // 0-6 for Sunday-Saturday
  const hours = Array.from({ length: 24 }, (_, i) => i) // 0-23

  const gridData = days.map(day => ({
    day,
    dayName: getDayName(day),
    hours: hours.map(hour => {
      const existingData = matrix[day.toString()]?.[hour.toString()]
      return {
        hour,
        hourFormatted: formatHour(hour),
        data: existingData || {
          time_bucket: '',
          day_of_week: day,
          hour_of_day: hour,
          call_count: 0,
          sms_count: 0,
          total_duration: 0,
          unique_contacts: 0,
          intensity: 0
        } as HeatmapDataPoint,
        color: getIntensityColor(existingData?.intensity || 0),
        isEmpty: !existingData
      }
    })
  }))

  return {
    gridData,
    maxIntensity,
    totalDataPoints: data.length
  }
}

/**
 * Get heatmap data with full processing for React components
 * 
 * @param params - Heatmap parameters
 * @returns Processed heatmap data ready for visualization
 */
export const getProcessedHeatmapData = async (params: HeatmapParams) => {
  const { data: rawData, error } = await getHeatmapData(params)
  
  if (error || !rawData) {
    return { data: null, error }
  }

  const processedData = processHeatmapForVisualization(rawData, params.view_mode || 'weekly')
  
  return {
    data: {
      raw: rawData,
      processed: processedData
    },
    error: null
  }
}