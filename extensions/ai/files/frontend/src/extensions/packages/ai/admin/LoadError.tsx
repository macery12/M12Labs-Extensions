import { Button, createTranslator } from '@/extensions-sdk';

const t = createTranslator('ai');

export function AiLoadError({ onRetry }: { onRetry: () => void }) {
    return (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-[var(--color-danger)]">{t('common.states.error', 'Something went wrong')}</p>
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
                {t('common.actions.retry', 'Try again')}
            </Button>
        </div>
    );
}
