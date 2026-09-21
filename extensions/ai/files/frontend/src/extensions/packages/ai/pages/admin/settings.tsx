import AiSection from '../../admin/AiSection';

/*
 * The nine-route settings section, as one declared admin page.
 *
 * The panel mounts an admin page at a splat route, so everything under
 * /admin/extensions/ext/ai/settings/* arrives here and `AiSection` routes it.
 * That is the whole reason the section survived the move intact: nine pages
 * that each own one slice of the settings document, one save each, and an
 * address for every one of them.
 */
export default function AiSettingsPage() {
    return <AiSection />;
}
