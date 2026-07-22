import { PrimaryGeneratedColumn } from 'typeorm';

/** Toda tabla del schema usa `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`. */
export abstract class UuidBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;
}
