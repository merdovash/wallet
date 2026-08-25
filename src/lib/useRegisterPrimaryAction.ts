import { useEffect, useRef } from 'react'
import {
  usePrimaryActionStore,
  type PrimaryActionOverride,
} from '../store/primaryActionStore'

/** Пока `active`, FAB показывает это действие вместо чек-ина. */
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
      onClick: () => onClickRef.current(),
    })
    return () => {
      const current = usePrimaryActionStore.getState().override
      if (current?.id === action.id) setOverride(null)
    }
  }, [active, action.id, action.label, action.disabled, action.title, setOverride])
}
