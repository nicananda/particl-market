// Copyright (c) 2017-2020, The Particl Market developers
// Distributed under the GPL software license, see the accompanying
// file COPYING or https://github.com/particl/particl-market/blob/develop/LICENSE

// tslint:disable:max-classes-per-file
import * as _ from 'lodash';
import { MissingParamException } from '../exceptions/MissingParamException';
import { InvalidParamException } from '../exceptions/InvalidParamException';
import { BidDataValue } from '../enums/BidDataValue';
import { EscrowReleaseType, EscrowType, SaleType } from 'omp-lib/dist/interfaces/omp-enums';
import { Cryptocurrency } from 'omp-lib/dist/interfaces/crypto';
import { ModelServiceInterface } from '../services/ModelServiceInterface';
import { ModelNotFoundException } from '../exceptions/ModelNotFoundException';
import {CommentType} from '../enums/CommentType';
import {EnumHelper} from '../../core/helpers/EnumHelper';

export type ValidationFunction = (value: any, index: number, allValues: any[]) => Promise<boolean>;

export interface CommandParamValidationRules {
    params: ParamValidationRule[];
}

export interface ParamValidationRule {
    name: string;
    required: boolean;
    type?: string;
    defaultValue?: any;
    customValidate: ValidationFunction;
}

export abstract class BaseParamValidationRule implements ParamValidationRule {

    public name: string;
    public required: boolean;
    public type?: string;
    public defaultValue?: any;

    constructor(required: boolean = false) {
        this.required = required;
    }

    public async customValidate(value: any, index: number, allValues: any[]): Promise<boolean> {
        return true;
    }
}

export class BaseIdValidationRule extends BaseParamValidationRule {
    public type = 'number';
    public modelService?: ModelServiceInterface<any>;

    constructor(required: boolean = false, modelService?: ModelServiceInterface<any>) {
        super(required);
        this.modelService = modelService;
    }

    public async customValidate(value: any, index: number, allValues: any[]): Promise<boolean> {
        if ((!_.isNil(value) || this.required) && value < 0) {
            throw new InvalidParamException(this.name, 'value < 0');
        }

        // if modelService is set, make sure we can find something with the id
        if (!_.isNil(value) && this.modelService) {

           await this.modelService.findOne(value, false)
               .catch(reason => {
                   const modelName = this.name.charAt(0).toUpperCase() + this.name.slice(1, -2);
                   throw new ModelNotFoundException(modelName);
               });
        }
        return true;
    }
}

export class BaseEnumValidationRule extends BaseParamValidationRule {
    public type = 'string';
    public validEnumType: string;
    public validEnumValues: any[];

    public async customValidate(value: any, index: number, allValues: any[]): Promise<boolean> {
        if (this.validEnumValues.indexOf(value) === -1) {
            throw new InvalidParamException(this.name, this.validEnumType);
        }
        return true;
    }
}

export class StringValidationRule extends BaseParamValidationRule {
    public type = 'string';

    constructor(name: string, required: boolean = false) {
        super(required);
        this.name = name;
    }
}


// Ids

export class ListingItemIdValidationRule extends BaseIdValidationRule {
    public name = 'listingItemId';
}

export class IdentityIdValidationRule extends BaseIdValidationRule {
    public name = 'identityId';
}

export class ProfileIdValidationRule extends BaseIdValidationRule {
    public name = 'profileId';

    constructor(required: boolean = false, modelService?: ModelServiceInterface<any>) {
        super(required, modelService);
    }
}

export class CategoryIdValidationRule extends BaseIdValidationRule {
    public name = 'categoryId';
}


// Misc

export class AddressOrAddressIdValidationRule extends BaseParamValidationRule {

    public name = 'address|addressId';
    public type = undefined;

    private MPA_BID_REQUIRED_ADDRESS_KEYS: string[] = [
        BidDataValue.SHIPPING_ADDRESS_FIRST_NAME.toString(),
        BidDataValue.SHIPPING_ADDRESS_LAST_NAME.toString(),
        BidDataValue.SHIPPING_ADDRESS_ADDRESS_LINE1.toString(),
        BidDataValue.SHIPPING_ADDRESS_CITY.toString(),
        BidDataValue.SHIPPING_ADDRESS_STATE.toString(),
        BidDataValue.SHIPPING_ADDRESS_ZIP_CODE.toString(),
        BidDataValue.SHIPPING_ADDRESS_COUNTRY.toString()
    ];

    public async customValidate(value: any, index: number, allValues: any[]): Promise<boolean> {
        if (typeof value === 'boolean' && value === false) {
            // make sure that required keys are there
            for (const addressKey of this.MPA_BID_REQUIRED_ADDRESS_KEYS) {
                if (!_.includes(allValues, addressKey.toString()) ) {
                    throw new MissingParamException(addressKey);
                }
            }
        } else if (typeof value !== 'number') {
            // anything other than number should fail then
            throw new InvalidParamException('address', 'false|number');
        }
        return true;
    }
}

// Strings

export class TitleValidationRule extends BaseParamValidationRule {
    public name = 'title';
    public type = 'string';

    public async customValidate(value: any, index: number, allValues: any[]): Promise<boolean> {
        return true;
    }
}

export class ShortDescriptionValidationRule extends BaseParamValidationRule {
    public name = 'shortDescription';
    public type = 'string';

    public async customValidate(value: any, index: number, allValues: any[]): Promise<boolean> {
        return true;
    }
}

export class LongDescriptionValidationRule extends BaseParamValidationRule {
    public name = 'longDescription';
    public type = 'string';

    public async customValidate(value: any, index: number, allValues: any[]): Promise<boolean> {
        return true;
    }
}


// Numeric

export class BasePriceValidationRule extends BaseParamValidationRule {
    public name = 'basePrice';
    public type = 'number';
    public defaultValue = 0;

    public async customValidate(value: any, index: number, allValues: any[]): Promise<boolean> {
        if (!_.isNil(value)) {
            // why couldn't we sell free shit?
            return value >= 0;
        }
        return true;
    }
}

export class DomesticShippingPriceValidationRule extends BaseParamValidationRule {
    public name = 'domesticShippingPrice';
    public type = 'number';
    public defaultValue = 0;

    public async customValidate(value: any, index: number, allValues: any[]): Promise<boolean> {
        if (!_.isNil(value)) {
            return value >= 0;
        }
        return true;
    }
}

export class InternationalShippingPriceValidationRule extends BaseParamValidationRule {
    public name = 'internationalShippingPrice';
    public type = 'number';
    public defaultValue = 0;

    public async customValidate(value: any, index: number, allValues: any[]): Promise<boolean> {
        if (!_.isNil(value)) {
            return value >= 0;
        }
        return true;
    }
}

export class BuyerRatioValidationRule extends BaseParamValidationRule {
    public name = 'buyerRatio';
    public type = 'number';
    public defaultValue = 100;

    public async customValidate(value: any, index: number, allValues: any[]): Promise<boolean> {
        if (!_.isNil(value)) {
            return value >= 0;
        }
        return true;
    }
}

export class SellerRatioValidationRule extends BaseParamValidationRule {
    public name = 'sellerRatio';
    public type = 'number';
    public defaultValue = 100;

    public async customValidate(value: any, index: number, allValues: any[]): Promise<boolean> {
        if (!_.isNil(value)) {
            return value >= 0;
        }
        return true;
    }
}


// Enums

export class SaleTypeValidationRule extends BaseEnumValidationRule {
    public name = 'saleType';
    public validEnumType: 'SaleType';
    public validEnumValues = [SaleType.SALE];
    public defaultValue = SaleType.SALE;
}

export class CryptocurrencyValidationRule extends BaseEnumValidationRule {
    public name = 'currency';
    public validEnumType: 'Cryptocurrency';
    public validEnumValues = [Cryptocurrency.PART];
    public defaultValue = Cryptocurrency.PART;
}

export class EscrowTypeValidationRule extends BaseEnumValidationRule {
    public name = 'escrowType';
    public validEnumType: 'EscrowType';
    public validEnumValues = [EscrowType.MAD_CT, EscrowType.MULTISIG];
    public defaultValue = EscrowType.MAD_CT;
}

export class EscrowReleaseTypeValidationRule extends BaseEnumValidationRule {
    public name = 'escrowReleaseType';
    public validEnumType: 'EscrowReleaseType';
    public validEnumValues = [EscrowReleaseType.ANON, EscrowReleaseType.BLIND];
    public defaultValue = EscrowReleaseType.ANON;
}

export class CommentTypeValidationRule extends BaseEnumValidationRule {
    public name = 'commentType';
    public validEnumType: 'CommentType';
    public validEnumValues = EnumHelper.getValues(CommentType);
}


// tslint:enable:max-classes-per-file
