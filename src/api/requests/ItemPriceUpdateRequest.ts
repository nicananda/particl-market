import { IsNotEmpty } from 'class-validator';
import { RequestBody } from '../../core/api/RequestBody';


export class ItemPriceUpdateRequest extends RequestBody {

    @IsNotEmpty()
    public payment_information_id: number;

    @IsNotEmpty()
    public currency: string;

    @IsNotEmpty()
    public basePrice: number;

}

