//! Decode trusted formats under allocation/dimension limits; re-encode to discard active content/metadata.
use anyhow::{Result, ensure};
use image::{ImageFormat, ImageReader, Limits, codecs::jpeg::JpegEncoder};
use std::{collections::HashMap, io::Cursor};
pub const MAX_UPLOAD: usize = 8 * 1024 * 1024;
pub struct Processed {
    pub bytes: Vec<u8>,
    pub palette: Vec<String>,
}
pub fn process(bytes: Vec<u8>, hero: bool) -> Result<Processed> {
    let format = image::guess_format(&bytes)?;
    ensure!(
        matches!(
            format,
            ImageFormat::Jpeg | ImageFormat::Png | ImageFormat::WebP
        ),
        "Use JPEG, PNG or WebP artwork"
    );
    let mut reader = ImageReader::with_format(Cursor::new(&bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(8000);
    limits.max_image_height = Some(8000);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode()?;
    ensure!(
        u64::from(image.width()) * u64::from(image.height()) <= 32_000_000,
        "Artwork has too many pixels"
    );
    let mut bins: HashMap<(u8, u8, u8), u32> = HashMap::new();
    for p in image.thumbnail(64, 64).to_rgb8().pixels() {
        let key = (p[0] / 32, p[1] / 32, p[2] / 32);
        *bins.entry(key).or_default() += 1;
    }
    let mut bins: Vec<_> = bins.into_iter().collect();
    bins.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    let mut colours: Vec<(u8, u8, u8)> = Vec::new();
    for ((r, g, b), _) in bins {
        let rgb = (r * 32 + 16, g * 32 + 16, b * 32 + 16);
        if colours.iter().all(|v| {
            (i32::from(v.0) - i32::from(rgb.0)).pow(2)
                + (i32::from(v.1) - i32::from(rgb.1)).pow(2)
                + (i32::from(v.2) - i32::from(rgb.2)).pow(2)
                > 1200
        }) {
            colours.push(rgb);
        }
        if colours.len() == 3 {
            break;
        }
    }
    let palette = colours
        .into_iter()
        .map(|(r, g, b)| format!("#{r:02x}{g:02x}{b:02x}"))
        .collect();
    let resized = if hero {
        image.thumbnail(2400, 1600)
    } else {
        image.thumbnail(1600, 2400)
    }
    .to_rgb8();
    let mut output = Vec::new();
    JpegEncoder::new_with_quality(&mut output, 88).encode_image(&resized)?;
    ensure!(
        output.len() <= 12 * 1024 * 1024,
        "Processed artwork is too large"
    );
    Ok(Processed {
        bytes: output,
        palette,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn active_or_malformed_images_are_rejected() {
        assert!(process(b"<svg onload='alert(1)'/>".to_vec(), false).is_err());
        assert!(process(vec![0; 100], false).is_err());
    }
}
