export declare const PRODUCT_NAME: string;
export declare const PWA_BACKGROUND: string;
export declare const PWA_THEME: string;
export declare const MANIFEST_PATH: string;
export declare const APPLE_ICON_PATH: string;
export declare const OG_SITE_REL_PATH: string;
export declare function escapeHtml(value: unknown): string;
export declare function pwaAppName(): string;
export declare function pwaShortName(name: string): string;
export declare function publicAppHost(hostHeader: string | null | undefined): string;
export declare function resolvePublicHost(hostHeader: string | null | undefined): string;
export declare function isDocumentPath(pathname: string | null | undefined): boolean;
export declare function renderWebManifest(): string;
export declare function pwaHeadTags(shortName?: string): Array<[string, string]>;

export type OgSite = { title?: string; description?: string; image?: string };

export declare function readOgSite(cwd?: string): OgSite;
export declare function ogCardPublicPath(cwd?: string): string;
export declare function snapshotOgIdentity(cwd?: string): { site: OgSite };
export declare function titleFromDocument(html: string): string;
export declare function resolveOgTitle(site?: OgSite, appName?: string, documentTitle?: string): string;
export declare function ogHeadTags(ctx?: {
  host?: string;
  appName?: string;
  site?: OgSite;
  documentTitle?: string;
}): string[];
export declare function stripShareMetaTags(html: string): string;
export declare function injectPwaHead(
  html: string,
  ctx?: { host?: string | null; cwd?: string; site?: OgSite },
): string;
export declare function createHeadInjector(ctx?: { host?: string | null; cwd?: string; site?: OgSite }): {
  push(chunk: Uint8Array | string): Buffer[];
  flush(): Buffer[];
};
