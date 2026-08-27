import type { ReactNode } from 'react'
import { useRegisterPrimaryAction } from '../../lib/useRegisterPrimaryAction'
import { Button } from './FormControls'
import { StackPanel } from './StackPanel'

export interface EntityEditPanelProps {
  open: boolean
  title: string
  onClose: () => void
  /** Persist / apply changes. Panel chrome (Save / Close) is shared. */
  onSave: () => void | Promise<void>
  saveDisabled?: boolean
  saveTitle?: string
  saveLabel?: string
  /** Unique id for primary-action registration (nested panels). */
  saveActionId?: string
  /** When false, does not claim the Save FAB (e.g. nested panel is open). Default true. */
  saveActive?: boolean
  /** Extra header controls before Save (e.g. help). */
  headerExtras?: ReactNode
  children: ReactNode
}

/**
 * Общий паттерн панели редактирования сущности:
 * одинаковые Save / Close / внешний вид; меняются только контент и onSave.
 * На мобиле Save — через FAB; на десктопе — кнопка в шапке панели.
 */
export function EntityEditPanel({
  open,
  title,
  onClose,
  onSave,
  saveDisabled = false,
  saveTitle,
  saveLabel = 'Сохранить',
  saveActionId = 'entity-edit-save',
  saveActive = true,
  headerExtras,
  children,
}: EntityEditPanelProps) {
  useRegisterPrimaryAction(open && saveActive, {
    id: saveActionId,
    label: saveLabel,
    scope: 'panel',
    disabled: saveDisabled,
    title: saveTitle,
    onClick: () => {
      void onSave()
    },
  })

  return (
    <StackPanel
      open={open}
      title={title}
      onClose={onClose}
      headerActions={
        <>
          {headerExtras}
          <Button
            type="button"
            className="!hidden !px-3 !py-1.5 md:!inline-flex"
            disabled={saveDisabled}
            title={saveTitle}
            onClick={() => void onSave()}
          >
            {saveLabel}
          </Button>
        </>
      }
    >
      {children}
    </StackPanel>
  )
}
