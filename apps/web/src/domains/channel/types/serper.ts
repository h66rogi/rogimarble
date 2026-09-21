export interface SerperSearchRequest {
  title: string;
  artist: string;
}

export interface SerperImageItem {
  title: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  thumbnailUrl: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  source: string;
  domain: string;
  link: string;
  googleUrl: string;
  position: number;
}

export interface SerperSearchResponse {
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
    type: string;
    engine: string;
    num: number;
  };
  images: SerperImageItem[];
  credits: number;
  allowable_urls: string[];
}

export interface SerperVideoSearchRequest {
  query: string;
  num?: number;
}

export interface SerperVideoItem {
  title: string;
  link: string;
  snippet?: string;
  imageUrl?: string;
  duration?: string;
  channel?: string;
  date?: string;
  source?: string;
  position?: number;
}

export interface SerperVideoSearchResponse {
  searchParameters?: {
    q: string;
    gl?: string;
    hl?: string;
    type?: string;
    engine?: string;
    num?: number;
  };
  videos: SerperVideoItem[];
  credits?: number;
}

export interface SerperWebSearchRequest {
  query: string;
  num?: number;
}

export interface SerperWebResultItem {
  title: string;
  link: string;
  snippet?: string;
  domain?: string;
  date?: string;
  position?: number;
}

export interface SerperWebSearchResponse {
  searchParameters?: {
    q: string;
    gl?: string;
    hl?: string;
    type?: string;
    engine?: string;
    num?: number;
  };
  organic: SerperWebResultItem[];
  credits?: number;
}
