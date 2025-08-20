import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { PieChart } from 'react-native-chart-kit';

interface PieChartData {
  name: string;
  population: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
}

interface CommunicationPieChartProps {
  data: PieChartData[] | null;
  title?: string;
  loading?: boolean;
  error?: string | null;
}

const { width: screenWidth } = Dimensions.get('window');

export const CommunicationPieChart: React.FC<CommunicationPieChartProps> = ({
  data,
  title = 'Communication Types',
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

  if (!data || data.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No data available</Text>
          <Text style={styles.emptySubtext}>Communication data will appear here</Text>
        </View>
      </View>
    );
  }

  const totalEvents = data.reduce((sum, item) => sum + item.population, 0);

  if (totalEvents === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No events yet</Text>
          <Text style={styles.emptySubtext}>Start collecting data to see insights</Text>
        </View>
      </View>
    );
  }

  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    color: (_opacity = 1) => `rgba(0, 0, 0, ${_opacity})`,
    labelColor: (_opacity = 1) => `rgba(107, 114, 128, ${_opacity})`,
    style: {
      borderRadius: 12,
    },
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {totalEvents.toLocaleString()} total communications
        </Text>
      </View>
      
      <View style={styles.chartContainer}>
        <PieChart
          data={data}
          width={screenWidth - 48}
          height={220}
          chartConfig={chartConfig}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="15"
          center={[10, 10]}
          absolute
        />
      </View>

      {/* Custom Statistics */}
      <View style={styles.statsContainer}>
        {data.map((item, index) => (
          <View key={index} style={styles.statItem}>
            <View style={styles.statRow}>
              <View style={[styles.colorIndicator, { backgroundColor: item.color }]} />
              <Text style={styles.statLabel}>{item.name}</Text>
              <Text style={styles.statValue}>{item.population.toLocaleString()}</Text>
            </View>
            <View style={styles.percentageContainer}>
              <Text style={styles.percentage}>
                {((item.population / totalEvents) * 100).toFixed(1)}%
              </Text>
            </View>
          </View>
        ))}
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
    paddingBottom: 12,
  },
  statsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  statItem: {
    marginBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  statLabel: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  percentageContainer: {
    marginLeft: 24,
  },
  percentage: {
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