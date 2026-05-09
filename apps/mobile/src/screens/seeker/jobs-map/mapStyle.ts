/**
 * Custom Google Maps style for the Jobs map view.
 *
 * Goal: feel like a continuation of the warm-black canvas, not a default
 * Google grey-blue. Roads are subdued, parks are a deep jade, water is
 * a near-black so the map recedes and the orange pins pop.
 *
 * Tuned in Snazzy Maps style format. Apple Maps on iOS ignores this
 * (uses the OS default), which is fine — the platform feel is honored.
 */

export const DOONDO_DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0E0C10' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9C9688' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0C0A0E' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#C4BEB1' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#767164' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#0E2922' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1A1916' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0C0A0E' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#767164' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#272622' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#1A1916' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#06080F' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3D3A34' }],
  },
];
