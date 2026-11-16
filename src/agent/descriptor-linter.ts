/**
 * Action descriptor validator and Vertex AI tool-declaration schema sanitizer.
 */
import type { ActionDescriptor, StrictActionInputSchema, JsonSchemaProperty } from "../domain/types";

const SNAKE_CASE_PATTERN = /^[a-z]+(_[a-z0-9]+)+$/;

export function lintDescriptor(descriptor: ActionDescriptor): string[] {
  const errors: string[] = [];

  // 1. Name validation
  if (!SNAKE_CASE_PATTERN.test(descriptor.name)) {
    errors.push(
      `Action name '${descriptor.name}' must be snake_case matching /^[a-z]+(_[a-z0-9]+)+$/ (e.g. 'scan_room_planes').`
    );
  }

  // 2. Description validation (>= 2 sentences, length >= 80)
  const desc = descriptor.description ?? "";
  if (desc.length < 80) {
    errors.push(
      `Action '${descriptor.name}' description length (${desc.length}) is under the 80 character minimum.`
    );
  }
  const sentenceMatches = desc.match(/[.!?](\s+|$)/g);
  if (!sentenceMatches || sentenceMatches.length < 2) {
    errors.push(
      `Action '${descriptor.name}' description must contain at least 2 complete sentences naming units, preconditions, and example calls.`
    );
  }

  // 3. Input schema structure
  const schema = descriptor.inputSchema;
  if (!schema || schema.type !== "object") {
    errors.push(`Action '${descriptor.name}' inputSchema must be type 'object'.`);
  } else {
    if (schema.additionalProperties !== false) {
      errors.push(
        `Action '${descriptor.name}' inputSchema must specify 'additionalProperties: false'.`
      );
    }
    lintSchemaProperties(descriptor.name, schema.properties ?? {}, errors);
  }

  // 4. Approval gate summary for destructive actions
  if (descriptor.annotations?.destructive === true) {
    if (typeof descriptor.gateSummary !== "function") {
      errors.push(
        `Destructive action '${descriptor.name}' must define a gateSummary function for ApprovalGate rendering.`
      );
    }
  }

  return errors;
}

function lintSchemaProperties(
  actionName: string,
  properties: Record<string, JsonSchemaProperty>,
  errors: string[],
  path = ""
): void {
  for (const [key, prop] of Object.entries(properties)) {
    const propPath = path ? `${path}.${key}` : key;
    const rawProp = prop as unknown as Record<string, unknown>;

    // Reject unions and combinators
    if ("anyOf" in rawProp || "oneOf" in rawProp || "allOf" in rawProp) {
      errors.push(
        `Property '${propPath}' in action '${actionName}' uses anyOf/oneOf/allOf combinators which are prohibited in strict schemas.`
      );
    }
    if (Array.isArray(rawProp.type)) {
      errors.push(
        `Property '${propPath}' in action '${actionName}' uses union type array which is prohibited.`
      );
    }

    if (prop.type === "object") {
      if (rawProp.additionalProperties !== false) {
        errors.push(
          `Nested object property '${propPath}' in action '${actionName}' must specify additionalProperties: false.`
        );
      }
      if (prop.properties) {
        lintSchemaProperties(actionName, prop.properties, errors, propPath);
      }
    }

    if (prop.type === "array" && prop.items) {
      if (prop.items.type === "object") {
        const itemObj = prop.items as unknown as Record<string, unknown>;
        if (itemObj.additionalProperties !== false) {
          errors.push(
            `Array item object '${propPath}[]' in action '${actionName}' must specify additionalProperties: false.`
          );
        }
        if (prop.items.properties) {
          lintSchemaProperties(actionName, prop.items.properties, errors, `${propPath}[]`);
        }
      }
    }
  }
}

export function sanitizeSchemaForVertex(
  schema: StrictActionInputSchema
): Record<string, unknown> {
  return sanitizeValue(schema) as Record<string, unknown>;
}

function sanitizeValue(val: unknown): unknown {
  if (val === null || typeof val !== "object") {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeValue(item));
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    // Strip additionalProperties for Vertex AI endpoint compatibility
    if (k === "additionalProperties") {
      continue;
    }
    result[k] = sanitizeValue(v);
  }
  return result;
}
