import "server-only";
import bcrypt from "bcryptjs";
import { z } from "zod";

export const UserInput = z.object({
  name: z.string().trim().min(1, "Falta el nombre.").max(30, "El nombre es muy largo."),
  pin: z.string().regex(/^\d{4,8}$/, "El PIN tiene que tener de 4 a 8 números."),
});

export const hashPin = (pin: string) => bcrypt.hash(pin, 10);
