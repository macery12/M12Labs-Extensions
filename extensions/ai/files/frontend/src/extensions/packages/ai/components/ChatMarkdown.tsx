import { Markdown, createTranslator } from '@/extensions-sdk';

const t = createTranslator('ai');

export function ChatMarkdown({ content }: { content: string }) {
    return (
        <Markdown
            content={content}
            copyLabel={t('common.actions.copy', 'Copy')}
            copiedLabel={t('common.states.copied', 'Copied')}
        />
    );
}
