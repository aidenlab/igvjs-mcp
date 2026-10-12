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
    name: 'load_tracks',
    title: 'Load tracks',
    description: `Load one or several tracks into igv-bot, each from the URL of its file. The URLs come from a reply of search_catalogues (pass the row's url, and its name as the track's name) or from the user, who may give any URL their browser can fetch. Load every track a request asks for in one call: they are shown in the order given, and the Session summary of the reply says where igv.js put them, as a rule above the genome's own annotation track. A track given no name gets igv.js's default, the name of its file. When a loose request matches many tracks in the Catalogues, pick a sensible default, say in one line what you picked, and load it; ask the user only when the candidates differ in a way they would care about. A track that does not load is reported as an error carrying igv.js's own message, as for a file that does not exist or a host that does not permit cross-origin requests; the other tracks of the call are still loaded, and the Session summary shows which. ${REPLY}`,
    inputSchema: {
      tracks: z
        .array(
          z.object({
            url: z.string().describe("The URL of the track's file, such as the url of a search_catalogues row"),
            name: z.string().optional().describe("The name to show the track under, such as the name of a search_catalogues row. Leave it out for the file's name."),
          }),
        )
        .min(1)
        .describe('The tracks to load, in the order they are to be shown, top to bottom'),
    },
    commandType: 'load_tracks',
  },
  {
    name: 'remove_track',
    title: 'Remove a track',
    description: `Remove one track from igv-bot, addressed by its name or by its position in the tracks of the Session summary, counted from 1 at the top: "the second track" is position 2 and "the bottom one" is the last. Give name or position, not both. The user also reorders and removes tracks by hand, so take a position from the Session summary of the reply just before, or call read_session_summary first. A name or position that matches no track is reported as an error listing the tracks, and a name that several tracks share as an error giving their positions; either way nothing is removed. The sequence track cannot be removed. ${REPLY}`,
    inputSchema: {
      name: z.string().optional().describe('The name of the track as the Session summary gives it. Case does not matter.'),
      // Any number: one that is no position is answered by the Viewer, which can list the tracks.
      position: z.number().optional().describe('The position of the track in the tracks of the Session summary: 1 is the top track'),
    },
    commandType: 'remove_track',
  },
  {
    name: 'set_track_height',
    title: 'Set track height',
    description: `Set the height of one, several or all tracks of igv-bot: to a number of pixels, or "taller" (half as high again) or "shorter" (two thirds as high), so that one undoes the other. A height runs from 1 to 1000 pixels: a number outside that is an error, and taller and shorter stop there. Address the tracks by their names, by their positions in the tracks of the Session summary, counted from 1 at the top, or pass all for every track. Change every track a request means in one call. The user also reorders, resizes and removes tracks by hand, so take positions and heights from the Session summary of the reply just before, or call read_session_summary first. A name or position that matches no track is reported as an error listing the tracks, and a name that several tracks share as an error giving their positions; either way no height is changed. The sequence track keeps its height: all leaves it as it is, and addressing it is an error. The Session summary gives heights in whole pixels. ${REPLY}`,
    inputSchema: {
      // Any number: one that is no height is answered by the Viewer, which gives the limits.
      height: z
        .union([z.number(), z.enum(['taller', 'shorter'])])
        .describe('The height in pixels, from 1 to 1000, or "taller" for 1.5 times the height each track has now, or "shorter" for two thirds of it'),
      names: z.array(z.string()).optional().describe('The names of the tracks as the Session summary gives them. Case does not matter.'),
      // Any numbers: one that is no position is answered by the Viewer, which can list the tracks.
      positions: z.array(z.number()).optional().describe('The positions of the tracks in the tracks of the Session summary: 1 is the top track'),
      all: z.boolean().optional().describe('True for every track, in place of names and positions'),
    },
    commandType: 'set_track_height',
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
