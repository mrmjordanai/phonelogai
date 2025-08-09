'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { 
  HomeIcon, 
  UsersIcon, 
  ClockIcon,
  ChatBubbleLeftRightIcon,
  ChartBarIcon, 
  CogIcon,
  ShieldCheckIcon,
  CreditCardIcon,
  QuestionMarkCircleIcon,
  DocumentArrowUpIcon
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'dashboard', href: '/', icon: HomeIcon },
  { name: 'events', href: '/events', icon: ClockIcon },
  { name: 'contacts', href: '/contacts', icon: UsersIcon },
  { name: 'analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Chat with Data', href: '/chat', icon: ChatBubbleLeftRightIcon },
  { name: 'Upload', href: '/upload', icon: DocumentArrowUpIcon },
];

const secondaryNavigation = [
  { name: 'privacy', href: '/privacy', icon: ShieldCheckIcon },
  { name: 'billing', href: '/billing', icon: CreditCardIcon },
  { name: 'settings', href: '/settings', icon: CogIcon },
  { name: 'support', href: '/support', icon: QuestionMarkCircleIcon },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg">
      <div className="flex h-16 shrink-0 items-center px-6">
        <h1 className="text-xl font-bold text-gray-900">PhoneLog AI</h1>
      </div>
      
      <nav className="flex flex-1 flex-col px-6 pb-4">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map((item) => {
                const current = pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={classNames(
                        current
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:text-blue-700 hover:bg-gray-50',
                        'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'
                      )}
                    >
                      <item.icon
                        className={classNames(
                          current ? 'text-blue-700' : 'text-gray-400 group-hover:text-blue-700',
                          'h-6 w-6 shrink-0'
                        )}
                        aria-hidden="true"
                      />
                      {t(`navigation.${item.name}`, item.name)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
          
          <li className="mt-auto">
            <ul role="list" className="-mx-2 space-y-1">
              {secondaryNavigation.map((item) => {
                const current = pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={classNames(
                        current
                          ? 'bg-gray-50 text-gray-900'
                          : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50',
                        'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'
                      )}
                    >
                      <item.icon
                        className={classNames(
                          current ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-900',
                          'h-6 w-6 shrink-0'
                        )}
                        aria-hidden="true"
                      />
                      {t(`navigation.${item.name}`, item.name)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        </ul>
      </nav>
    </div>
  );
}