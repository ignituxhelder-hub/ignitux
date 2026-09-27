import { IsIn } from 'class-validator';

export class ChoixBureauDto {
  @IsIn(['ajoutee', 'retiree'], { message: 'choix doit valoir « ajoutee » ou « retiree ».' })
  choix!: 'ajoutee' | 'retiree';
}
