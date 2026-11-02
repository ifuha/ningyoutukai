import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'
import { themeInitScript } from '#/lib/theme'
import { useClearCacheOnUserChange } from '#/lib/cache-owner'
import { LoadingStatus } from '#/components/loading-status'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: '人形使い',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
    // 最初の描画の前に、保存された表示モード(ライト / ダーク)を反映する(ちらつき防止)
    scripts: [{ children: themeInitScript }],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
})

// 全画面(ログイン画面を含む)で動く場所。ユーザーが変わったら、取得したデータのキャッシュを消す
function RootComponent() {
  useClearCacheOnUserChange()
  return (
    <>
      <Outlet />
      <LoadingStatus />
    </>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
