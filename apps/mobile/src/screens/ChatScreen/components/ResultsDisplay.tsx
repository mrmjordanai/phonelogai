/**
 * ResultsDisplay Component
 * Data visualization component for query results (tables, charts, text)
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList
} from 'react-native';
import { 
  ResultsDisplayProps, 
  TableResult, 
  ChartResult, 
  ListResult 
} from '../types';

const ResultsDisplay: React.FC<ResultsDisplayProps> = memo(({
  result,
  onExport
}) => {
  const handleExport = (format: 'csv' | 'json') => {
    if (onExport) {
      onExport(result.data, format);
    }
  };

  const renderTextResult = (data: string) => (
    <View style={styles.textContainer}>
      <Text style={styles.textContent}>{data}</Text>
    </View>
  );

  const renderTableResult = (data: TableResult) => (
    <View style={styles.tableContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View>
          {/* Table header */}
          <View style={styles.tableHeader}>
            {data.columns.map((column, index) => (
              <View
                key={column.key}
                style={[
                  styles.tableHeaderCell,
                  index === 0 && styles.firstCell,
                  index === data.columns.length - 1 && styles.lastCell
                ]}
              >
                <Text style={styles.tableHeaderText}>{column.title}</Text>
              </View>
            ))}
          </View>

          {/* Table rows */}
          {data.rows.map((row, rowIndex) => (
            <View
              key={rowIndex}
              style={[
                styles.tableRow,
                rowIndex % 2 === 0 && styles.evenRow
              ]}
            >
              {data.columns.map((column, colIndex) => (
                <View
                  key={`${rowIndex}-${column.key}`}
                  style={[
                    styles.tableCell,
                    colIndex === 0 && styles.firstCell,
                    colIndex === data.columns.length - 1 && styles.lastCell
                  ]}
                >
                  <Text style={styles.tableCellText}>
                    {String(row[column.key] || '')}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Export options */}
      {result.metadata?.exportable && (
        <View style={styles.exportButtons}>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => handleExport('csv')}
            accessibilityRole="button"
            accessibilityLabel="Export as CSV"
          >
            <Text style={styles.exportButtonText}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={() => handleExport('json')}
            accessibilityRole="button"
            accessibilityLabel="Export as JSON"
          >
            <Text style={styles.exportButtonText}>JSON</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderChartResult = (data: ChartResult) => (
    <View style={styles.chartContainer}>
      {data.title && (
        <Text style={styles.chartTitle}>{data.title}</Text>
      )}

      {/* Simple bar chart representation */}
      {data.chartType === 'bar' && (
        <View style={styles.barChart}>
          {data.data.map((item, index) => {
            const maxValue = Math.max(...data.data.map(d => d.value));
            const barHeight = (item.value / maxValue) * 100;

            return (
              <View key={index} style={styles.barContainer}>
                <View style={styles.barWrapper}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${barHeight}%`,
                        backgroundColor: item.color || '#007AFF'
                      }
                    ]}
                  />
                </View>
                <Text style={styles.barLabel} numberOfLines={2}>
                  {item.label}
                </Text>
                <Text style={styles.barValue}>{item.value}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Simple pie chart representation */}
      {data.chartType === 'pie' && (
        <View style={styles.pieChart}>
          {data.data.map((item, index) => (
            <View key={index} style={styles.pieItem}>
              <View
                style={[
                  styles.pieColorIndicator,
                  { backgroundColor: item.color || '#007AFF' }
                ]}
              />
              <Text style={styles.pieLabel}>
                {item.label}: {item.value}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Axis labels */}
      {(data.xAxis || data.yAxis) && (
        <View style={styles.chartAxes}>
          {data.xAxis && <Text style={styles.axisLabel}>X: {data.xAxis}</Text>}
          {data.yAxis && <Text style={styles.axisLabel}>Y: {data.yAxis}</Text>}
        </View>
      )}
    </View>
  );

  const renderListResult = (data: ListResult) => (
    <View style={styles.listContainer}>
      <FlatList
        data={data.items}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <View style={[
            styles.listItem,
            index === data.items.length - 1 && styles.lastListItem
          ]}>
            <Text style={styles.listItemPrimary}>{item.primary}</Text>
            {item.secondary && (
              <Text style={styles.listItemSecondary}>{item.secondary}</Text>
            )}
          </View>
        )}
        scrollEnabled={false}
      />
    </View>
  );

  const renderResult = () => {
    switch (result.type) {
      case 'text':
        return renderTextResult(result.data as string);
      case 'table':
        return renderTableResult(result.data as TableResult);
      case 'chart':
        return renderChartResult(result.data as ChartResult);
      case 'list':
        return renderListResult(result.data as ListResult);
      default:
        return renderTextResult('Unsupported result type');
    }
  };

  return (
    <View style={styles.container}>
      {renderResult()}
      
      {/* Metadata */}
      {result.metadata && (
        <View style={styles.metadata}>
          {result.metadata.rowCount && (
            <Text style={styles.metadataText}>
              {result.metadata.rowCount} items
            </Text>
          )}
          {result.metadata.executionTime && (
            <Text style={styles.metadataText}>
              {Math.round(result.metadata.executionTime)}ms
            </Text>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  textContainer: {
    padding: 4,
  },
  textContent: {
    fontSize: 15,
    lineHeight: 22,
    color: '#000000',
  },
  tableContainer: {
    marginVertical: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  tableHeaderCell: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 80,
    borderRightWidth: 1,
    borderRightColor: '#E5E5EA',
  },
  tableHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  evenRow: {
    backgroundColor: '#FAFAFA',
  },
  tableCell: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 80,
    borderRightWidth: 1,
    borderRightColor: '#E5E5EA',
    justifyContent: 'center',
  },
  tableCellText: {
    fontSize: 14,
    color: '#1D1D1F',
  },
  firstCell: {
    borderLeftWidth: 1,
    borderLeftColor: '#E5E5EA',
  },
  lastCell: {
    borderRightWidth: 0,
  },
  exportButtons: {
    flexDirection: 'row',
    marginTop: 8,
    justifyContent: 'flex-end',
  },
  exportButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    marginLeft: 8,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  chartContainer: {
    marginVertical: 8,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
    textAlign: 'center',
    marginBottom: 12,
  },
  barChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 120,
    paddingHorizontal: 8,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  barWrapper: {
    height: 80,
    justifyContent: 'flex-end',
    width: '70%',
  },
  bar: {
    width: '100%',
    borderRadius: 2,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 10,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
  },
  barValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1D1D1F',
    textAlign: 'center',
    marginTop: 2,
  },
  pieChart: {
    paddingVertical: 8,
  },
  pieItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  pieColorIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  pieLabel: {
    fontSize: 14,
    color: '#1D1D1F',
  },
  chartAxes: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  axisLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontStyle: 'italic',
  },
  listContainer: {
    marginVertical: 4,
  },
  listItem: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  lastListItem: {
    borderBottomWidth: 0,
  },
  listItemPrimary: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1D1D1F',
  },
  listItemSecondary: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  metadata: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
  },
  metadataText: {
    fontSize: 12,
    color: '#8E8E93',
  },
});

ResultsDisplay.displayName = 'ResultsDisplay';

export { ResultsDisplay };