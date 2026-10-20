import * as z from 'zod';
import { notFound } from '@/libs/ApiAuth';
import { getDemoPage } from '@/libs/Demos';
import { getPlaceDetails, getPlacePhotoUri } from '@/services/GooglePlaces';
import { DemoSlugValidation } from '@/validations/DemoValidation';

const MAX_PHOTOS = 5;

/** The first photo fills the landing's hero; the others sit in half-width columns. */
const HERO_WIDTH_PX = 1600;

const PHOTO_WIDTH_PX = 1000;

// Public: sends the browser to the business's Google photos on Google's CDN, without exposing the API key
export const GET = async (
  _request: Request,
  props: { params: Promise<{ slug: string; index: string }> },
) => {
  const { slug, index } = await props.params;
  const position = z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_PHOTOS - 1)
    .safeParse(index);

  if (!DemoSlugValidation.safeParse(slug).success || !position.success) {
    return notFound();
  }

  const page = await getDemoPage(slug);
  const placeId = page?.demo.data.placeId;

  if (!placeId) {
    return notFound();
  }

  const details = await getPlaceDetails(placeId);
  const photo = details.photos.at(position.data);
  const photoUri = photo
    ? await getPlacePhotoUri({
        name: photo.name,
        maxWidthPx: position.data === 0 ? HERO_WIDTH_PX : PHOTO_WIDTH_PX,
      })
    : null;

  if (!photoUri) {
    return notFound();
  }

  return new Response(null, {
    status: 302,
    headers: { Location: photoUri, 'Cache-Control': 'public, max-age=86400' },
  });
};
