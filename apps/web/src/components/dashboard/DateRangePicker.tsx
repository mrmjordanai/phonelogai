'use client';

import React, { useState, Fragment } from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { ChevronUpDownIcon, CheckIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { format, subDays, subWeeks, subMonths, startOfDay, endOfDay } from 'date-fns';

export interface DateRange {
  from: Date;
  to: Date;
  preset?: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

interface PresetRange {
  label: string;
  value: string;
  getRange: () => { from: Date; to: Date };
}

const presetRanges: PresetRange[] = [
  {
    label: 'Last 7 days',
    value: 'last-7-days',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 6)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: 'Last 14 days',
    value: 'last-14-days',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 13)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: 'Last 30 days',
    value: 'last-30-days',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 29)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: 'Last 3 months',
    value: 'last-3-months',
    getRange: () => ({
      from: startOfDay(subMonths(new Date(), 3)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: 'Last 6 months',
    value: 'last-6-months',
    getRange: () => ({
      from: startOfDay(subMonths(new Date(), 6)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: 'This week',
    value: 'this-week',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), new Date().getDay())),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: 'This month',
    value: 'this-month',
    getRange: () => ({
      from: startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: 'Custom range',
    value: 'custom',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 7)),
      to: endOfDay(new Date()),
    }),
  },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export function DateRangePicker({ value, onChange, className = '' }: DateRangePickerProps) {
  const [showCustomInputs, setShowCustomInputs] = useState(value.preset === 'custom');
  const [fromInput, setFromInput] = useState(format(value.from, 'yyyy-MM-dd'));
  const [toInput, setToInput] = useState(format(value.to, 'yyyy-MM-dd'));

  const selectedPreset = presetRanges.find(preset => preset.value === value.preset) || presetRanges[0];

  const handlePresetChange = (preset: PresetRange) => {
    if (preset.value === 'custom') {
      setShowCustomInputs(true);
      onChange({
        from: value.from,
        to: value.to,
        preset: 'custom',
      });
    } else {
      setShowCustomInputs(false);
      const range = preset.getRange();
      onChange({
        from: range.from,
        to: range.to,
        preset: preset.value,
      });
    }
  };

  const handleCustomDateChange = () => {
    try {
      const fromDate = new Date(fromInput);
      const toDate = new Date(toInput);
      
      if (fromDate > toDate) {
        return; // Invalid range
      }

      onChange({
        from: startOfDay(fromDate),
        to: endOfDay(toDate),
        preset: 'custom',
      });
    } catch (error) {
      console.error('Invalid date input:', error);
    }
  };

  const formatDateRange = () => {
    if (showCustomInputs) {
      return `${format(value.from, 'MMM d, yyyy')} - ${format(value.to, 'MMM d, yyyy')}`;
    }
    return selectedPreset.label;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Preset Selector */}
      <div className="relative">
        <Listbox value={selectedPreset} onChange={handlePresetChange}>
          {({ open }) => (
            <>
              <Listbox.Button className="relative w-full cursor-default rounded-md bg-white py-2 pl-3 pr-10 text-left shadow-sm border border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm">
                <span className="flex items-center">
                  <CalendarIcon className="h-5 w-5 text-gray-400 mr-2" />
                  <span className="block truncate">{formatDateRange()}</span>
                </span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </span>
              </Listbox.Button>

              <Transition
                show={open}
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                  {presetRanges.map((preset) => (
                    <Listbox.Option
                      key={preset.value}
                      className={({ active }) =>
                        classNames(
                          active ? 'bg-blue-600 text-white' : 'text-gray-900',
                          'relative cursor-default select-none py-2 pl-3 pr-9'
                        )
                      }
                      value={preset}
                    >
                      {({ selected, active }) => (
                        <>
                          <span
                            className={classNames(
                              selected ? 'font-semibold' : 'font-normal',
                              'block truncate'
                            )}
                          >
                            {preset.label}
                          </span>

                          {selected ? (
                            <span
                              className={classNames(
                                active ? 'text-white' : 'text-blue-600',
                                'absolute inset-y-0 right-0 flex items-center pr-4'
                              )}
                            >
                              <CheckIcon className="h-5 w-5" aria-hidden="true" />
                            </span>
                          ) : null}
                        </>
                      )}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </Transition>
            </>
          )}
        </Listbox>
      </div>

      {/* Custom Date Inputs */}
      {showCustomInputs && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="from-date" className="block text-sm font-medium text-gray-700 mb-1">
              From
            </label>
            <input
              type="date"
              id="from-date"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
              onBlur={handleCustomDateChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="to-date" className="block text-sm font-medium text-gray-700 mb-1">
              To
            </label>
            <input
              type="date"
              id="to-date"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
              onBlur={handleCustomDateChange}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>
      )}

      {/* Quick Info */}
      {!showCustomInputs && (
        <div className="text-xs text-gray-500">
          {format(value.from, 'MMM d, yyyy')} - {format(value.to, 'MMM d, yyyy')} ({Math.ceil((value.to.getTime() - value.from.getTime()) / (1000 * 60 * 60 * 24))} days)
        </div>
      )}
    </div>
  );
}