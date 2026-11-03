import { UnstyledButton } from '@mantine/core';
import type { z } from 'zod';
import type { discoveryGenreSchema } from '../../shared/discovery.js';
import { genreArtwork } from '../../shared/genre-artwork.js';
export function GenreButton({ genre }: { genre: z.infer<typeof discoveryGenreSchema> }) {
  const preset = genreArtwork[genre.key];
  const image = genre.image ? `/media/${genre.image}` : preset?.image;
  const hue = (Array.from(genre.name).length * 37) % 360;
  const palette = genre.image ? genre.image_palette[0] : preset?.accent;
  const channels =
    palette && /^#[0-9a-f]{6}$/i.test(palette)
      ? [1, 3, 5].map((i) => parseInt(palette.slice(i, i + 2), 16))
      : [0, 0, 0];
  const light = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722 > 150;
  const accent = light ? '#16202b' : '#ffffff';
  return (
    <UnstyledButton
      component="a"
      href={`/discover/genres/${encodeURIComponent(genre.key)}`}
      className={`genre-button ${image ? 'genre-button-image' : 'genre-button-text'}`}
      style={
        image
          ? {
              backgroundImage: `url("${image}")`,
              color: accent,
              textShadow: light
                ? '0 1px 3px white, 0 0 5px white'
                : '0 1px 3px black, 0 0 5px black',
            }
          : { color: `light-dark(hsl(${hue} 65% 30%), hsl(${hue} 70% 78%))` }
      }
    >
      {genre.name}
    </UnstyledButton>
  );
}
