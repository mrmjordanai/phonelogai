// ResultsDisplay Component
// Formats and displays query results with export functionality

'use client'

import React from 'react'
import { 
  ClipboardDocumentIcon,
  ClockIcon,
  HashtagIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline'
import { ResultsDisplayProps, ExportFormat } from './types'

const formatDuration = (ms?: number): string => {
  if (!ms) return 'N/A'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') {
    // Format large numbers with commas
    return value.toLocaleString()
  }
  return String(value)
}

const exportToCSV = (data: Record<string, unknown>[]): string => {
  if (!data || data.length === 0) return ''
  
  const headers = Object.keys(data[0])
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = formatValue(row[header])
        // Escape quotes and wrap in quotes if contains comma
        return value.includes(',') ? `"${value.replace(/"/g, '""')}"` : value
      }).join(',')
    )
  ]
  
  return csvRows.join('\n')
}

const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  results,
  metadata,
  onExport,
  onCopy
}) => {
  if (!results || results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-500">
        <HashtagIcon className="h-8 w-8 mb-2 opacity-50" />
        <p>No results found</p>
        <p className="text-sm">Try adjusting your query or check the suggestions above</p>
      </div>
    )
  }

  const headers = Object.keys(results[0])
  const hasMoreColumns = headers.length > 6

  const handleExport = (format: ExportFormat) => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
    
    if (format === 'csv') {
      const csv = exportToCSV(results)
      downloadFile(csv, `nlq-results-${timestamp}.csv`, 'text/csv')
    } else if (format === 'json') {
      const json = JSON.stringify(results, null, 2)
      downloadFile(json, `nlq-results-${timestamp}.json`, 'application/json')
    }
    
    onExport?.(results, format)
  }

  const handleCopyResults = () => {
    const text = results.map(row => 
      headers.map(header => formatValue(row[header])).join('\t')
    ).join('\n')
    
    navigator.clipboard.writeText(text).then(() => {
      onCopy?.()
    }).catch(err => {
      console.warn('Failed to copy to clipboard:', err)
    })
  }

  return (
    <div className="space-y-4">
      {/* Metadata Header */}
      {metadata && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <HashtagIcon className="h-4 w-4" />
            <span>{metadata.rowCount} rows</span>
          </div>
          
          {metadata.executionTime && (
            <div className="flex items-center gap-1">
              <ClockIcon className="h-4 w-4" />
              <span>{formatDuration(metadata.executionTime)}</span>
            </div>
          )}
          
          {metadata.sqlGenerated && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
              <CodeBracketIcon className="h-3 w-3 mr-1" />
              SQL Generated
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyResults}
            className="inline-flex items-center px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <ClipboardDocumentIcon className="h-3 w-3 mr-1" />
            Copy
          </button>
          
          <button
            onClick={() => handleExport('csv')}
            className="inline-flex items-center px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <DocumentTextIcon className="h-3 w-3 mr-1" />
            CSV
          </button>
          
          <button
            onClick={() => handleExport('json')}
            className="inline-flex items-center px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <ArrowDownTrayIcon className="h-3 w-3 mr-1" />
            JSON
          </button>
        </div>

        {hasMoreColumns && (
          <p className="text-xs text-gray-500">
            Scroll right to see more columns
          </p>
        )}
      </div>

      {/* Results Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-auto max-h-96">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {headers.map((header) => (
                  <th 
                    key={header}
                    className="px-4 py-2 text-left text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap"
                  >
                    {header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {results.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  {headers.map((header) => (
                    <td 
                      key={header}
                      className="px-4 py-2 text-sm text-gray-900 whitespace-nowrap max-w-xs truncate"
                      title={formatValue(row[header])}
                    >
                      {formatValue(row[header])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SQL Query Display */}
      {metadata?.sqlGenerated && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 flex items-center">
            <CodeBracketIcon className="h-4 w-4 mr-1" />
            View Generated SQL
          </summary>
          <div className="mt-2 p-3 bg-gray-50 rounded-lg border">
            <pre className="text-xs overflow-auto text-gray-700 whitespace-pre-wrap">
              {metadata.sqlGenerated}
            </pre>
          </div>
        </details>
      )}
    </div>
  )
}