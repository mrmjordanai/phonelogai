'use client';

import React, { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { useAuth } from '../AuthProvider';
import { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';

interface UserMenuProps {
  user: User | null;
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export function UserMenu({ user }: UserMenuProps) {
  const { signOut } = useAuth();
  const { t } = useTranslation();

  if (!user) return null;

  const userNavigation = [
    { name: t('common.profile'), href: '/profile' },
    { name: t('common.settings'), href: '/settings' },
    { name: t('common.logout'), onClick: signOut },
  ];

  return (
    <Menu as="div" className="relative">
      <Menu.Button className="-m-1.5 flex items-center p-1.5">
        <span className="sr-only">Open user menu</span>
        <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
          <span className="text-sm font-medium text-white">
            {user.email?.[0]?.toUpperCase() || 'U'}
          </span>
        </div>
        <span className="hidden lg:flex lg:items-center">
          <span className="ml-4 text-sm font-semibold leading-6 text-gray-900" aria-hidden="true">
            {user.email}
          </span>
          <ChevronDownIcon className="ml-2 h-5 w-5 text-gray-400" aria-hidden="true" />
        </span>
      </Menu.Button>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 z-10 mt-2.5 w-32 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-gray-900/5 focus:outline-none">
          {userNavigation.map((item) => (
            <Menu.Item key={item.name}>
              {({ active }) => (
                <button
                  onClick={item.onClick}
                  className={classNames(
                    active ? 'bg-gray-50' : '',
                    'block w-full text-left px-3 py-1 text-sm leading-6 text-gray-900'
                  )}
                >
                  {item.name}
                </button>
              )}
            </Menu.Item>
          ))}
        </Menu.Items>
      </Transition>
    </Menu>
  );
}