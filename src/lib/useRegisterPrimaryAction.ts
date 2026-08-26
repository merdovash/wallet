import { useEffect, useRef } from 'react'
import {
  usePrimaryActionStore,
  type PrimaryActionOverride,
} from '../store/primaryActionStore'

/** Пока `active`, переопределяет основное действие (или регистрирует Save панели). */
export function useRegisterPrimaryAction(
  active: boolean,
  action: Omit<PrimaryActionOverride, 'onClick'> & { onClick: () => void },
): void {
  const setOverride = usePrimaryActionStore((s) => s.setOverride)
  const onClickRef = useRef(action.onClick)
  onClickRef.current = action.onClick

  useEffect(() => {
    if (!active) return
    setOverride({
      id: action.id,
      label: action.label,
      disabled: action.disabled,
      title: action.title,
      scope: action.scope,
      onClick: () => onClickRef.current(),
    })
    return () => {
      const current = usePrimaryActionStore.getState().override
      if (current?.id === action.id) setOverride(null)
    }
  }, [
    active,
    action.id,
    action.label,
    action.disabled,
    action.title,
    action.scope,
    setOverride,
  ])
}
