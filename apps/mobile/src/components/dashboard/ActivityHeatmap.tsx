import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

interface HeatmapData {
  count: number;
  intensity: number;
}

interface ActivityHeatmapProps {
  data: HeatmapData[][] | null;
  title?: string;
  loading?: boolean;
  error?: string | null;
  dayLabels?: string[];
}

const HOUR_LABELS = [
  '12AM', '1AM', '2AM', '3AM', '4AM', '5AM', '6AM', '7AM', '8AM', '9AM', '10AM', '11AM',
  '12PM', '1PM', '2PM', '3PM', '4PM', '5PM', '6PM', '7PM', '8PM', '9PM', '10PM', '11PM'
];

const DEFAULT_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({
  data,
  title = 'Activity Heatmap',
  loading = false,
  error = null,
  dayLabels = DEFAULT_DAY_LABELS,
}) => {
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading heatmap...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Unable to load heatmap</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No activity data</Text>
          <Text style={styles.emptySubtext}>Heatmap will show when data is available</Text>
        </View>
      </View>
    );
  }

  // Get intensity colors based on percentage
  const getIntensityColor = (intensity: number): string => {
    if (intensity === 0) return '#F3F4F6';
    if (intensity <= 20) return '#DBEAFE';
    if (intensity <= 40) return '#93C5FD';
    if (intensity <= 60) return '#60A5FA';
    if (intensity <= 80) return '#3B82F6';
    return '#1D4ED8';
  };

  // Find the most active time for insights
  let maxIntensity = 0;
  let peakDay = '';
  let peakHour = '';
  
  data.forEach((dayData, dayIndex) => {
    dayData.forEach((hourData, hourIndex) => {
      if (hourData.intensity > maxIntensity) {
        maxIntensity = hourData.intensity;
        peakDay = dayLabels[dayIndex];
        peakHour = HOUR_LABELS[hourIndex];
      }
    });
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          Peak activity: {peakDay} at {peakHour}
        </Text>
      </View>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.heatmapScrollContainer}
      >
        <View style={styles.heatmapContainer}>
          {/* Hour labels */}
          <View style={styles.hourLabelsContainer}>
            <View style={styles.dayLabelSpacer} />
            {HOUR_LABELS.map((hour, index) => (
              <View key={index} style={styles.hourLabelCell}>
                <Text style={styles.hourLabel}>
                  {index % 4 === 0 ? hour : ''} {/* Show every 4th hour to avoid crowding */}
                </Text>
              </View>
            ))}
          </View>

          {/* Heatmap grid */}
          {data.map((dayData, dayIndex) => (
            <View key={dayIndex} style={styles.heatmapRow}>
              {/* Day label */}
              <View style={styles.dayLabelCell}>
                <Text style={styles.dayLabel}>{dayLabels[dayIndex]}</Text>
              </View>
              
              {/* Hour cells */}
              {dayData.map((hourData, hourIndex) => (
                <TouchableOpacity
                  key={hourIndex}
                  style={[
                    styles.heatmapCell,
                    { backgroundColor: getIntensityColor(hourData.intensity) }
                  ]}
                  onPress={() => {
                    // Could show tooltip or drill down here
                    console.log(`${dayLabels[dayIndex]} ${HOUR_LABELS[hourIndex]}: ${hourData.count} events`);
                  }}
                  activeOpacity={0.7}
                >
                  {/* Only show count on high-activity cells to avoid clutter */}
                  {hourData.intensity > 60 && (
                    <Text style={styles.cellText}>{hourData.count}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Legend */}
      <View style={styles.legendContainer}>
        <Text style={styles.legendTitle}>Activity Level</Text>
        <View style={styles.legendRow}>
          <Text style={styles.legendLabel}>Less</Text>
          <View style={styles.legendSquares}>
            {[0, 20, 40, 60, 80, 100].map((intensity, index) => (
              <View
                key={index}
                style={[
                  styles.legendSquare,
                  { backgroundColor: getIntensityColor(intensity) }
                ]}
              />
            ))}
          </View>
          <Text style={styles.legendLabel}>More</Text>
        </View>
      </View>
    </View>
  );
};

const CELL_SIZE = 14;
const DAY_LABEL_WIDTH = 40;
const HOUR_LABEL_HEIGHT = 20;

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  heatmapScrollContainer: {
    paddingHorizontal: 16,
  },
  heatmapContainer: {
    paddingBottom: 16,
  },
  hourLabelsContainer: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayLabelSpacer: {
    width: DAY_LABEL_WIDTH,
  },
  hourLabelCell: {
    width: CELL_SIZE,
    height: HOUR_LABEL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 1,
  },
  hourLabel: {
    fontSize: 8,
    color: '#6B7280',
    textAlign: 'center',
  },
  heatmapRow: {
    flexDirection: 'row',
    marginBottom: 1,
  },
  dayLabelCell: {
    width: DAY_LABEL_WIDTH,
    height: CELL_SIZE,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  dayLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  heatmapCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    marginRight: 1,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellText: {
    fontSize: 8,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  legendContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  legendTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
    textAlign: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendLabel: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  legendSquares: {
    flexDirection: 'row',
    marginHorizontal: 8,
  },
  legendSquare: {
    width: 10,
    height: 10,
    marginRight: 1,
    borderRadius: 1,
  },
  loadingContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 4,
  },
  errorSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  emptyContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#D1D5DB',
    textAlign: 'center',
  },
});