import { ExtensionErrorBoundary, useExtensionServerContext } from '@/extensions-sdk';
import { AgentDrawer } from '../components/AgentDrawer';

/*
 * The assistant, mounted beside every server page rather than on one of them.
 *
 * `server-layout.overlay` is the slot for UI that is not part of the page: it
 * renders outside the content area on every route under a server, which is what
 * makes the drawer keep one conversation across navigation instead of a new one
 * per page.
 *
 * The panel gates this on the `agent-ready` flag before the module ever loads,
 * so nothing here re-asks whether the agent is switched on. What the drawer
 * still decides for itself is whether the assistant's own full page is open —
 * two of the same conversation on screen is not two views of it, it is two
 * clients competing to bind the same turn.
 */
export default function AgentDrawerSlot() {
    // Reading the context here means an overlay mounted outside a server
    // (which the panel does not do, but a future layout could) fails as a
    // missing provider at the boundary rather than as a blank drawer.
    const { server } = useExtensionServerContext();

    return (
        <ExtensionErrorBoundary extensionId="ai">
            <AgentDrawer key={server.uuid} />
        </ExtensionErrorBoundary>
    );
}
