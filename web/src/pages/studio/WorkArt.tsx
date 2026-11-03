import type { Artwork } from '../../shared/studio.js';
/** A low-frequency palette wash with a separately served grain texture; no remote URLs. */
export function WorkArt({ artwork }: { artwork: Artwork }) {
  const [a = '#24675a', b = a, c = b] = artwork.palette;
  return (
    <div
      className={`work-hero-art ${artwork.hero_url ? '' : 'work-hero-art--generated'}`}
      aria-hidden="true"
    >
      <div
        className="work-hero-colours"
        style={
          artwork.hero_url
            ? { backgroundImage: `url("${artwork.hero_url}")` }
            : {
                backgroundImage: `radial-gradient(ellipse at 15% 15%, ${a} 0%, transparent 65%), radial-gradient(ellipse at 80% 20%, ${b} 0%, transparent 65%), radial-gradient(ellipse at 50% 90%, ${c} 0%, transparent 70%)`,
              }
        }
      />
      {!artwork.hero_url && <div className="work-hero-grain" />}
    </div>
  );
}
