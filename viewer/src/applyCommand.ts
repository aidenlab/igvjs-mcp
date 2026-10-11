import type { Browser } from 'igv'
import { CommandType, type Command, type SessionSummary } from './protocol.ts'
import { currentSession, sessionSummary } from './session.ts'

type Applier<Type extends Command['type']> = (browser: Browser, command: Extract<Command, { type: Type }>) => Promise<void> | void

/**
 * `browser.search` resolves true or false (its type declarations say void). A
 * miss is raised in the words igv.js's own locus box uses for it.
 */
async function goTo(browser: Browser, locus: string): Promise<void> {
  const found = await (browser.search(locus) as unknown as Promise<boolean>)
  if (!found) throw new Error(`Unrecognized locus: ${locus}`)
}

/** One applier per command type: the Viewer's half of a row in the server's table of command tools. */
const APPLIERS: { [Type in Command['type']]: Applier<Type> } = {
  [CommandType.GO_TO_LOCUS]: (browser, { locus }) => goTo(browser, locus),
  // igv.js resolves a gene name through the same search as a locus.
  [CommandType.GO_TO_GENE]: (browser, { gene }) => goTo(browser, gene),
  [CommandType.ZOOM_IN]: (browser) => browser.zoomIn(),
  [CommandType.ZOOM_OUT]: (browser) => browser.zoomOut(),
}

/** Applies `command` to the genome browser and resolves with the resulting Session summary. */
export async function applyCommand(browser: Browser, command: Command): Promise<SessionSummary> {
  const apply = APPLIERS[command.type] as Applier<Command['type']>
  await apply(browser, command)
  return sessionSummary(currentSession(browser))
}
