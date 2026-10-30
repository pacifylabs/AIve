import { DefaultNamingStrategy, type NamingStrategyInterface } from 'typeorm';

const snake = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** Maps camelCase properties to snake_case columns, matching the hand-written SQL migrations. */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  override columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    return customName ?? snake([...embeddedPrefixes, propertyName].join('_'));
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return snake(`${relationName}_${referencedColumnName}`);
  }
}
