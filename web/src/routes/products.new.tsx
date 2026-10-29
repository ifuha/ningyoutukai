import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, X } from 'lucide-react'
import { IconButton } from '#/components/icon-button'
import { AppShell } from '#/components/app-shell'
import { Prompt, Terminal } from '#/components/terminal'
import { eden, edenData } from '#/lib/eden'
import { errorMessage } from '#/lib/error-message'

const createProduct = (productName: string) =>
  edenData(eden().api.product.post({ productName }))

// プロダクト作成(`/products/new`)。ログイン必須。仮の見た目(ターミナル風)
export const Route = createFileRoute('/products/new')({
  component: NewProduct,
})

function NewProduct() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    const productName = name.trim()
    if (productName === '') {
      setError('プロダクト名を入力してください')
      return
    }
    if (productName.length > 100) {
      setError('プロダクト名は 100 文字以内で入力してください')
      return
    }
    submitting.current = true
    setPending(true)
    setError(null)
    let created: Awaited<ReturnType<typeof createProduct>>
    try {
      created = await createProduct(productName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
      submitting.current = false
      setPending(false)
      return
    }
    void queryClient.invalidateQueries({ queryKey: ['products'] })
    void navigate({
      to: '/products/$productId',
      params: { productId: created.productId },
    })
  }

  return (
    <AppShell>
      {() => (
        <Terminal title="~/ningyoutukai — new product">
          <Prompt>mkdir product</Prompt>
          <form onSubmit={(e) => void submit(e)} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="product-name" className="block text-m">
                プロダクト名
              </label>
              <input
                id="product-name"
                type="text"
                autoFocus
                autoComplete="off"
                value={name}
                readOnly={pending}
                onChange={(e) => setName(e.target.value)}
                className="h-12 w-full border border-line bg-surface px-3 font-mono text-l focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink read-only:opacity-60"
              />
            </div>
            <div className="flex gap-3">
              <IconButton
                icon={Check}
                label="作成"
                tip={pending ? '作成中…' : undefined}
                type="submit"
                variant="solid"
                size="lg"
                disabled={pending}
              />
              <IconButton
                icon={X}
                label="キャンセル"
                variant="outline"
                size="lg"
                disabled={pending}
                onClick={() => void navigate({ to: '/home' })}
              />
            </div>
            {error && (
              <p role="alert" className="border-l border-line pl-3 text-m">
                ERR {errorMessage(error)}
              </p>
            )}
          </form>
        </Terminal>
      )}
    </AppShell>
  )
}
