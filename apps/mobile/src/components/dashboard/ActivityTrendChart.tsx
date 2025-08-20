import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

interface ActivityTrendChartProps {
  data: {
    labels: string[];
    datasets: Array<{
      data: number[];
      color: (_opacity?: number) => string;
      strokeWidth: number;
    }>;
  } | null;
  title?: string;
  loading?: boolean;
  error?: string | null;
}

const { width: screenWidth } = Dimensions.get('window');

export const ActivityTrendChart: React.FC<ActivityTrendChartProps> = ({
  data,
  title = 'Activity Trend',
  loading = false,
  error = null,
}) => {
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading chart...</Text>
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
          <Text style={styles.errorText}>Unable to load chart data</Text>
          <Text style={styles.errorSubtext}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!data || !data.datasets || data.datasets.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No data available</Text>
          <Text style={styles.emptySubtext}>Data will appear when events are available</Text>
        </View>
      </View>
    );
  }

  const chartData = {
    labels: data.labels.length > 10 
      ? data.labels.filter((_, index) => index % Math.ceil(data.labels.length / 10) === 0)
      : data.labels,
    datasets: data.datasets,
  };

  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (_opacity = 1) => `rgba(59, 130, 246, ${_opacity})`,
    labelColor: (_opacity = 1) => `rgba(107, 114, 128, ${_opacity})`,
    style: {
      borderRadius: 12,
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
      stroke: '#3B82F6',
    },
    propsForBackgroundLines: {
      strokeDasharray: '', // Remove dashed lines
      stroke: '#E5E7EB',
      strokeWidth: 1,
    },
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {data.datasets[0].data.reduce((sum, value) => sum + value, 0).toLocaleString()} total events
        </Text>
      </View>
      
      <View style={styles.chartContainer}>
        <LineChart
          data={chartData}
          width={screenWidth - 48}
          height={220}
          chartConfig={chartConfig}
          bezier
          style={styles.chart}
          withInnerLines={true}
          withOuterLines={true}
          withVerticalLines={true}
          withHorizontalLines={true}
          withVerticalLabels={true}
          withHorizontalLabels={true}
          fromZero={true}
        />
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
          <Text style={styles.legendText}>Events</Text>
        </View>
      </View>
    </View>
  );
};

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
    paddingBottom: 12,
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
  chartContainer: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  chart: {
    borderRadius: 12,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    color: '#6B7280',
  },
  loadingContainer: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    height: 220,
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
    height: 220,
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