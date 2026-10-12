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
]
