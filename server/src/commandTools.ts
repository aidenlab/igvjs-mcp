import { z, type ZodRawShape } from 'zod'
import { CommandType, type Command } from 'igvjs-mcp-viewer/protocol'

/**
 * One command tool: an MCP tool that sends one command to every Viewer in the
 * Room. `name`, `title`, `description` and `inputSchema` are the contract with
 * the Host; the command is `{type, ...args}`; `done` words the reply once the
 * Viewer has applied it.
 */
export interface CommandTool {
  name: string
  title: string
  description: string
  inputSchema: ZodRawShape
  type: Command['type']
  done: (args: Record<string, unknown>) => string
}

/**
 * The catalogue of command tools. Adding one is adding a row here, plus its
 * CommandType and its applier in the Viewer (viewer/src/applyCommand.ts).
 */
export const COMMAND_TOOLS: CommandTool[] = [
  {
    name: 'go_to_locus',
    title: 'Go to locus',
    description:
      'Move igv-bot to a locus given by coordinates or a chromosome name. Use this when the user names a region ("go to chr8:127,735,434-127,742,951", "show chr17", "whole genome"). For a gene name use go_to_gene instead. The reply carries the resulting Session summary, or igv.js\'s own error if the locus is not recognised.',
    inputSchema: {
      locus: z
        .string()
        .min(1)
        .describe(
          'Coordinates such as "chr8:127,735,434-127,742,951", a chromosome such as "chr8", or "all" for the whole genome. Several loci separated by spaces are shown side by side.',
        ),
    },
    type: CommandType.GO_TO_LOCUS,
    done: ({ locus }) => `Went to locus ${locus}.`,
  },
  {
    name: 'go_to_gene',
    title: 'Go to gene',
    description:
      'Move igv-bot to a gene, by name. Use this when the user names a gene ("go to MYC", "show me BRCA1"), so they do not have to look up coordinates. For coordinates or a chromosome use go_to_locus instead. The reply carries the resulting Session summary, or igv.js\'s own error if the gene is not found in the current genome.',
    inputSchema: {
      gene: z.string().min(1).describe('A gene name such as "MYC" or "BRCA1".'),
    },
    type: CommandType.GO_TO_GENE,
    done: ({ gene }) => `Went to gene ${gene}.`,
  },
  {
    name: 'zoom_in',
    title: 'Zoom in',
    description:
      'Zoom igv-bot in by a factor of two, keeping the centre of the view where it is. Call it again to zoom further. The reply carries the resulting Session summary; its loci do not change once the view is as close as igv.js allows.',
    inputSchema: {},
    type: CommandType.ZOOM_IN,
    done: () => 'Zoomed in.',
  },
  {
    name: 'zoom_out',
    title: 'Zoom out',
    description:
      'Zoom igv-bot out by a factor of two, keeping the centre of the view where it is when the chromosome allows. Call it again to zoom further. The reply carries the resulting Session summary; its loci do not change once the whole chromosome is in view.',
    inputSchema: {},
    type: CommandType.ZOOM_OUT,
    done: () => 'Zoomed out.',
  },
]
