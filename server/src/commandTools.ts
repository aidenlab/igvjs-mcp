import { z, type ZodRawShape } from 'zod'
import type { CommandType } from 'igvjs-mcp-viewer/protocol'

/**
 * A tool whose whole job is to send the Viewer one command. Its arguments are
 * the command's fields: the command is `{ type: commandType, ...arguments }`.
 */
export interface CommandTool {
  name: string
  title: string
  description: string
  inputSchema: ZodRawShape
  commandType: CommandType
  /** The argument that names a genome, if there is one. The command is sent only for a genome on the igv.org list, and carries the list's spelling of its id. */
  genomeArgument?: string
}

const REPLY = 'The reply is the resulting Session summary: genome, loci, and tracks in display order.'

/**
 * The command tools, one row each. Adding one is adding a row here, its
 * command to the protocol and its applier in the Viewer.
 */
export const COMMAND_TOOLS: CommandTool[] = [
  {
    name: 'go_to_locus',
    title: 'Go to a locus',
    description: `Move igv-bot to a locus given as coordinates, such as "chr8:127,735,434-127,742,951", or to a whole chromosome, such as "chr8". Use "all" for the whole-genome view. Several loci separated by spaces are shown side by side. For a gene name use go_to_gene. ${REPLY}`,
    inputSchema: {
      locus: z.string().describe('Coordinates as chr:start-end (1-based, commas allowed), a chromosome name, or "all"'),
    },
    commandType: 'go_to_locus',
  },
  {
    name: 'go_to_gene',
    title: 'Go to a gene',
    description: `Move igv-bot to a gene by its name, such as "MYC" or "BRCA1", looked up in the current genome. An unknown gene is reported as an error and the view does not move. ${REPLY}`,
    inputSchema: {
      gene: z.string().describe('Gene name or symbol, such as "MYC"'),
    },
    commandType: 'go_to_gene',
  },
  {
    name: 'zoom_in',
    title: 'Zoom in',
    description: `Zoom igv-bot in by a factor of two, keeping the centre of the view. Call it again to zoom further. The whole-genome view does not zoom: go to a locus or gene first. ${REPLY}`,
    inputSchema: {},
    commandType: 'zoom_in',
  },
  {
    name: 'zoom_out',
    title: 'Zoom out',
    description: `Zoom igv-bot out by a factor of two, keeping the centre of the view where possible. Call it again to zoom further. The whole-genome view does not zoom. ${REPLY}`,
    inputSchema: {},
    commandType: 'zoom_out',
  },
  {
    name: 'change_genome',
    title: 'Change genome',
    description: `Change igv-bot to another genome assembly, such as "hg19", "mm39" or "hs1" (human T2T). The tracks now loaded are removed and the new genome opens with its own default tracks, at its default view. Only the genomes on the igv.org genome list are available; for one that is not, the reply says so, lists those that are, and igv-bot is left as it was. ${REPLY}`,
    inputSchema: {
      genome: z.string().describe('Genome id as on the igv.org genome list, such as "hg38", "hg19", "mm39" or "hs1"'),
    },
    commandType: 'change_genome',
    genomeArgument: 'genome',
  },
  {
    name: 'read_session_summary',
    title: 'Read the Session summary',
    description:
      'Read what igv-bot is showing now, without changing anything: genome, loci, tracks in display order with name, type, URL and height, and whether the crosshairs and centre line are showing. The user also changes igv-bot by hand (panning, zooming, reordering, resizing or removing tracks) and you are not told when they do. Call this before describing the view or acting on a reference to it, such as "this region" or "the second track", unless a reply from another igv-bot tool has just given you the Session summary.',
    inputSchema: {},
    commandType: 'read_session_summary',
  },
]
