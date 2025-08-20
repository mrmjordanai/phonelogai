import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { BarChart } from 'react-native-chart-kit';

interface BarChartData {
  labels: string[];
  datasets: {
    data: number[];
    color?: (_opacity?: number) => string;
  }[];
}

interface DurationBarChartProps {
  data: BarChartData | null;
  title?: string;
  loading?: boolean;
  error?: string | null;
}

const { width: screenWidth } = Dimensions.get('window');

export const DurationBarChart: React.FC<DurationBarChartProps> = ({
  data,
  title = 'Call Duration Distribution',
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

  if (!data || !data.datasets || data.datasets.length === 0 || !data.datasets[0] || !data.datasets[0].data || data.datasets[0].data.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No call data available</Text>
          <Text style={styles.emptySubtext}>Duration analysis will appear when calls are recorded</Text>
        </View>
      </View>
    );
  }

  const totalCalls = data.datasets[0].data.reduce((sum, value) => sum + value, 0);

  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (_opacity = 1) => `rgba(139, 92, 246, ${_opacity})`,
    labelColor: (_opacity = 1) => `rgba(107, 114, 128, ${_opacity})`,
    style: {
      borderRadius: 12,
    },
    propsForBackgroundLines: {
      strokeDasharray: '',
      stroke: '#E5E7EB',
      strokeWidth: 1,
    },
    barPercentage: 0.7,
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {totalCalls.toLocaleString()} total calls analyzed
        </Text>
      </View>
      
      <View style={styles.chartContainer}>
        <BarChart
          data={data}
          width={screenWidth - 48}
          height={220}
          chartConfig={chartConfig}
          style={styles.chart}
          showValuesOnTopOfBars={true}
          withInnerLines={true}
          fromZero={true}
          verticalLabelRotation={0}
          showBarTops={false}
          yAxisLabel=""
          yAxisSuffix=""
        />
      </View>

      {/* Duration insights */}
      <View style={styles.insightsContainer}>
        <View style={styles.insightRow}>
          <Text style={styles.insightLabel}>Most Common Duration:</Text>
          <Text style={styles.insightValue}>
            {data.labels[data.datasets[0].data.indexOf(Math.max(...data.datasets[0].data))]}
          </Text>
        </View>
        <View style={styles.insightRow}>
          <Text style={styles.insightLabel}>Total Calls:</Text>
          <Text style={styles.insightValue}>{totalCalls.toLocaleString()}</Text>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#8B5CF6' }]} />
          <Text style={styles.legendText}>Call Count</Text>
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
  insightsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    marginTop: 8,
    paddingTop: 12,
  },
  insightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  insightLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  insightValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
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