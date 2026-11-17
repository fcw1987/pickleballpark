// Strict version dispatch. Historical v1 proofs retain their original theorem
// and bytes; v2 adds the separate selected acceleration-bounded route policy.
import { GENERATED_ROUTE_CERTIFICATE_VERSION, validGeneratedRouteCertificateShapeV1,
  certifyGeneratedRouteExclusionV1, matchesGeneratedRouteCertificateV1 } from './generated-route-certificate-v1.js';
import { GENERATED_ROUTE_CERTIFICATE_VERSION_V2, validGeneratedRouteCertificateShapeV2,
  certifyGeneratedRouteExclusionV2, matchesGeneratedRouteCertificateV2 } from './generated-route-certificate-v2.js';
import { GENERATED_ROUTE_CERTIFICATE_VERSION_V3, validGeneratedRouteCertificateShapeV3,
  certifyGeneratedRouteExclusionV3, matchesGeneratedRouteCertificateV3 } from './generated-route-certificate-v3.js';
const versionOf = value => {
  if (!value || typeof value !== 'object') return null;
  const property = Object.getOwnPropertyDescriptor(value, 'version');
  return property && Object.hasOwn(property, 'value') ? property.value : null;
};
export function validGeneratedRouteCertificateShape(value) {
  const version = versionOf(value);
  return version === GENERATED_ROUTE_CERTIFICATE_VERSION ? validGeneratedRouteCertificateShapeV1(value)
    : version === GENERATED_ROUTE_CERTIFICATE_VERSION_V2 ? validGeneratedRouteCertificateShapeV2(value)
      : version === GENERATED_ROUTE_CERTIFICATE_VERSION_V3 ? validGeneratedRouteCertificateShapeV3(value) : false;
}
export function certifyGeneratedRouteExclusion(play, segment, solved, { version } = {}) {
  if (version === GENERATED_ROUTE_CERTIFICATE_VERSION) return certifyGeneratedRouteExclusionV1(play, segment, solved);
  if (version === GENERATED_ROUTE_CERTIFICATE_VERSION_V2) return certifyGeneratedRouteExclusionV2(play, segment, solved);
  if (version === GENERATED_ROUTE_CERTIFICATE_VERSION_V3) return certifyGeneratedRouteExclusionV3(play, segment, solved);
  if (version !== undefined) return null;
  // Prefer the historical, broader exclusion whenever it already proves the
  // result. A failed search alone never establishes either theorem.
  return certifyGeneratedRouteExclusionV1(play, segment, solved) ?? certifyGeneratedRouteExclusionV2(play, segment, solved)
    ?? certifyGeneratedRouteExclusionV3(play, segment, solved);
}
export function matchesGeneratedRouteCertificate(declared, current) {
  if (!validGeneratedRouteCertificateShape(declared) || !validGeneratedRouteCertificateShape(current)
    || versionOf(declared) !== versionOf(current)) return false;
  return versionOf(declared) === GENERATED_ROUTE_CERTIFICATE_VERSION
    ? matchesGeneratedRouteCertificateV1(declared, current) : versionOf(declared) === GENERATED_ROUTE_CERTIFICATE_VERSION_V2 ? matchesGeneratedRouteCertificateV2(declared, current)
      : matchesGeneratedRouteCertificateV3(declared, current);
}
