import { useMutation } from '@tanstack/react-query';
import { Button, Modal, Spinner, notify, createTranslator } from '@/extensions-sdk';

const t = createTranslator('ai');

/**
 * Shared confirmation for the server and administrator conversation rails.
 *
 * Conversation deletion used to happen immediately and swallowed failures.
 * Keeping the dialog open on failure makes the result unambiguous, while the
 * global error flash gives the same feedback as the panel's other mutations.
 */
export function DeleteConversationModal({
    title,
    onClose,
    onDelete,
}: {
    title: string;
    onClose: () => void;
    onDelete: () => Promise<void>;
}) {
    const remove = useMutation({
        mutationFn: onDelete,
        onSuccess: onClose,
        onError: () => notify('error', t('common.states.genericError', 'Something went wrong. Please try again.')),
    });

    return (
        <Modal
            open
            onClose={onClose}
            title={t('server.deleteTitle', 'Delete conversation?')}
            size="sm"
            footer={
                <>
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={remove.isPending}>
                        {t('common.actions.cancel', 'Cancel')}
                    </Button>
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={() => remove.mutate()}
                        disabled={remove.isPending}
                    >
                        {remove.isPending && <Spinner className="h-4 w-4" />}
                        {t('server.deleteSubmit', 'Delete conversation')}
                    </Button>
                </>
            }
        >
            <p className="break-words text-sm text-[var(--color-ink-muted)]">
                {t('server.deleteBody', 'Delete “{title}”? This conversation and its transcript will be permanently removed.', { title })}
            </p>
        </Modal>
    );
}
