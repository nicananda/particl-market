// Copyright (c) 2017-2020, The Particl Market developers
// Distributed under the GPL software license, see the accompanying
// file COPYING or https://github.com/particl/particl-market/blob/develop/LICENSE

import * as _ from 'lodash';
import * as resources from 'resources';
import { inject, named } from 'inversify';
import { validate, request } from '../../../core/api/Validate';
import { Logger as LoggerType } from '../../../core/Logger';
import { Types, Core, Targets } from '../../../constants';
import { RpcRequest } from '../../requests/RpcRequest';
import { RpcCommandInterface } from '../RpcCommandInterface';
import { ListingItemAddRequest } from '../../requests/action/ListingItemAddRequest';
import { Commands } from '../CommandEnumType';
import { BaseCommand } from '../BaseCommand';
import { SmsgSendResponse } from '../../responses/SmsgSendResponse';
import { ListingItemAddActionService } from '../../services/action/ListingItemAddActionService';
import { MessageException } from '../../exceptions/MessageException';
import { MarketService } from '../../services/model/MarketService';
import { ListingItemTemplateService } from '../../services/model/ListingItemTemplateService';
import { InvalidParamException } from '../../exceptions/InvalidParamException';
import { SmsgSendParams } from '../../requests/action/SmsgSendParams';
import { MissingParamException } from '../../exceptions/MissingParamException';
import { ConfigurableHasher } from 'omp-lib/dist/hasher/hash';
import { HashableListingItemTemplateConfig } from '../../factories/hashableconfig/model/HashableListingItemTemplateConfig';
import { CryptoAddress, CryptoAddressType } from 'omp-lib/dist/interfaces/crypto';
import { EscrowType } from 'omp-lib/dist/interfaces/omp-enums';
import { NotImplementedException } from '../../exceptions/NotImplementedException';
import { CoreRpcService } from '../../services/CoreRpcService';
import { ModelNotFoundException } from '../../exceptions/ModelNotFoundException';
import { CryptocurrencyAddressService } from '../../services/model/CryptocurrencyAddressService';
import { CryptocurrencyAddressCreateRequest } from '../../requests/model/CryptocurrencyAddressCreateRequest';
import { ItemPriceService } from '../../services/model/ItemPriceService';
import { ListingItemImageAddRequest } from '../../requests/action/ListingItemImageAddRequest';
import { ListingItemImageAddActionService } from '../../services/action/ListingItemImageAddActionService';
import { ItemCategoryService } from '../../services/model/ItemCategoryService';
import { ItemCategoryFactory } from '../../factories/ItemCategoryFactory';

export class ListingItemTemplatePostCommand extends BaseCommand implements RpcCommandInterface<SmsgSendResponse> {

    public log: LoggerType;

    constructor(
        // tslint:disable:max-line-length
        @inject(Types.Core) @named(Core.Logger) public Logger: typeof LoggerType,
        @inject(Types.Service) @named(Targets.Service.CoreRpcService) public coreRpcService: CoreRpcService,
        @inject(Types.Service) @named(Targets.Service.action.ListingItemAddActionService) public listingItemAddActionService: ListingItemAddActionService,
        @inject(Types.Service) @named(Targets.Service.action.ListingItemImageAddActionService) public listingItemImageAddActionService: ListingItemImageAddActionService,
        @inject(Types.Service) @named(Targets.Service.model.MarketService) public marketService: MarketService,
        @inject(Types.Service) @named(Targets.Service.model.ItemPriceService) public itemPriceService: ItemPriceService,
        @inject(Types.Service) @named(Targets.Service.model.CryptocurrencyAddressService) public cryptocurrencyAddressService: CryptocurrencyAddressService,
        @inject(Types.Service) @named(Targets.Service.model.ListingItemTemplateService) public listingItemTemplateService: ListingItemTemplateService,
        @inject(Types.Service) @named(Targets.Service.model.ItemCategoryService) public itemCategoryService: ItemCategoryService,
        @inject(Types.Factory) @named(Targets.Factory.ItemCategoryFactory) private itemCategoryFactory: ItemCategoryFactory
        // tslint:enable:max-line-length
    ) {
        super(Commands.TEMPLATE_POST);
        this.log = new Logger(__filename);
    }

    /**
     * posts a ListingItem to the network based on ListingItemTemplate
     *
     * data.params[]:
     *  [0]: listingItemTemplate: resources.ListingItemTemplate
     *  [1]: daysRetention
     *  [2]: market: resources.Market
     *  [3]: estimateFee
     *
     * @param data
     * @returns {Promise<ListingItemTemplate>}
     */
    @validate()
    public async execute( @request(RpcRequest) data: RpcRequest): Promise<SmsgSendResponse> {

        let listingItemTemplate: resources.ListingItemTemplate = data.params[0];
        const daysRetention: number = data.params[1] || parseInt(process.env.PAID_MESSAGE_RETENTION_DAYS, 10);
        const market: resources.Market = data.params[2];
        const estimateFee: boolean = data.params[3];

        this.log.debug('estimateFee:', estimateFee);

        // type === MARKETPLACE -> receive + publish keys are the same / private key in wif format
        // type === STOREFRONT -> receive key is private key, publish key is public key / DER hex encoded string
        // type === STOREFRONT_ADMIN -> receive + publish keys are different / private key in wif format

        // ListingItems always posted from market publishAddress to receiveAddress
        const fromAddress = market.publishAddress;
        const toAddress = market.receiveAddress;

        // if ListingItem contains a category, create the market categories
        const categoryArray: string[] = await this.itemCategoryFactory.getArray(listingItemTemplate.ItemInformation.ItemCategory);
        await this.itemCategoryService.createMarketCategoriesFromArray(market.receiveAddress, categoryArray);

        // if listingItemTemplate.hash doesn't yet exist, create it now, so that the ListingItemTemplate cannot be modified anymore
        if (!estimateFee) {
            // note!! hash should not be saved until just before the ListingItemTemplate is actually posted.
            // since ListingItemTemplates with hash should not (CANT) be modified anymore.
            const hash = ConfigurableHasher.hash(listingItemTemplate, new HashableListingItemTemplateConfig());
            listingItemTemplate = await this.listingItemTemplateService.updateHash(listingItemTemplate.id, hash).then(value => value.toJSON());
        }

        // this.log.debug('posting template:', JSON.stringify(listingItemTemplate, null, 2));

        const postRequest = {
            sendParams: new SmsgSendParams(market.Identity.wallet, fromAddress, toAddress, true, daysRetention, estimateFee),
            listingItem: listingItemTemplate,
            market, // TODO: remove this? it doesn't seem to be used
            seller: market.Identity
        } as ListingItemAddRequest;

        this.log.debug('postRequest.sendParams:', JSON.stringify(postRequest.sendParams, null, 2));

        // first post the ListingItem
        const smsgSendResponse: SmsgSendResponse = await this.listingItemAddActionService.post(postRequest);

        // then post the Images related to the ListingItem one by one
        const imageSmsgSendResponse: SmsgSendResponse = await this.postListingItemImages(listingItemTemplate, postRequest);
        smsgSendResponse.msgids = imageSmsgSendResponse.msgids;

        return smsgSendResponse;
    }

    /**
     * data.params[]:
     *  [0]: listingItemTemplateId
     *  [1]: daysRetention
     *  [2]: marketId
     *  [3]: estimateFee (optional, default: false)
     *
     * @param {RpcRequest} data
     * @returns {Promise<RpcRequest>}
     */
    public async validate(data: RpcRequest): Promise<RpcRequest> {

        // make sure the required params exist
        if (data.params.length < 1) {
            throw new MissingParamException('listingItemTemplateId');
        } else if (data.params.length < 2) {
            throw new MissingParamException('daysRetention');
        } else if (data.params.length < 3) {
            throw new MissingParamException('marketId');
        }

        // make sure the params are of correct type
        if (typeof data.params[0] !== 'number') {
            throw new InvalidParamException('listingItemTemplateId', 'number');
        } else if (typeof data.params[1] !== 'number') {
            throw new InvalidParamException('daysRetention', 'number');
        } else if (typeof data.params[2] !== 'number') {
            throw new InvalidParamException('marketId', 'number');
        }

        if (data.params[1] > parseInt(process.env.PAID_MESSAGE_RETENTION_DAYS, 10)) {
            throw new MessageException('daysRetention is too large, max: ' + process.env.PAID_MESSAGE_RETENTION_DAYS);
        }

        if (data.params[3] !== undefined) {
            if (typeof data.params[3] !== 'boolean') {
                throw new InvalidParamException('estimateFee', 'boolean');
            }
        } else {
            data.params[3] = false;
        }

        // make sure required data exists and fetch it
        let listingItemTemplate: resources.ListingItemTemplate = await this.listingItemTemplateService.findOne(data.params[0])
            .then(value => value.toJSON())
            .catch(reason => {
                throw new ModelNotFoundException('ListingItemTemplate');
            });

        // make sure the ListingItemTemplate has a paymentAddress and generate and update it, if it doesn't
        // paymentAddress is part of the hash, so it needs to be created before the hash (unless it already exists)

        if (_.isEmpty(listingItemTemplate.PaymentInformation)) {
            throw new ModelNotFoundException('PaymentInformation');
        } else if (_.isEmpty(listingItemTemplate.PaymentInformation.ItemPrice)) {
            throw new ModelNotFoundException('ItemPrice');
        } else if (_.isEmpty(listingItemTemplate.ItemInformation.ItemCategory)) {
            // we cannot post without a category
            throw new ModelNotFoundException('ItemCategory');
        }

        const market: resources.Market = await this.marketService.findOne(data.params[2])
            .then(value => value.toJSON())
            .catch(reason => {
                throw new ModelNotFoundException('Market');
            });

        // update the paymentAddress in case it's not generated yet
        if (!listingItemTemplate.PaymentInformation.ItemPrice.CryptocurrencyAddress
            || _.isEmpty(listingItemTemplate.PaymentInformation.ItemPrice.CryptocurrencyAddress)) {
            listingItemTemplate = await this.updatePaymentAddress(market.Identity, listingItemTemplate);
        }

        // check size limit
        const templateMessageDataSize = await this.listingItemTemplateService.calculateMarketplaceMessageSize(listingItemTemplate);
        if (!templateMessageDataSize.fits) {
            throw new MessageException('ListingItemTemplate information exceeds message size limitations');
        }

        data.params[0] = listingItemTemplate;
        data.params[2] = market;

        return data;
    }

    public usage(): string {
        return this.getName() + ' <listingTemplateId> [daysRetention] [marketId] ';
    }

    public help(): string {
        return this.usage() + ' -  ' + this.description() + ' \n'
            + '    <listingTemplateId>           - number - The ID of the listing item template that we want to post. \n'
            + '    <daysRetention>               - number - Days the listing will be retained by network.\n'
            + '    <marketId>                    - number - Market ID. '
            + '    <estimateFee>                 - [optional] boolean, Just estimate the Fee, dont post the Proposal. \n';
    }

    public description(): string {
        return 'Post the ListingItemTemplate to the Marketplace.';
    }

    public example(): string {
        return 'template ' + this.getName() + ' 1 1 false';
    }

    private async generateCryptoAddressForEscrowType(identity: resources.Identity, type: EscrowType): Promise<CryptoAddress> {

        // generate paymentAddress for the item
        let cryptoAddress: CryptoAddress;
        switch (type) {
            case EscrowType.MULTISIG:
                const address = await this.coreRpcService.getNewAddress(identity.wallet);
                cryptoAddress = {
                    address,
                    type: CryptoAddressType.NORMAL
                };
                break;
            case EscrowType.MAD_CT:
                cryptoAddress = await this.coreRpcService.getNewStealthAddress(identity.wallet);
                break;
            case EscrowType.MAD:
            case EscrowType.FE:
            default:
                throw new NotImplementedException();
        }

        return cryptoAddress;
    }

    /**
     * update the paymentaddress for the template to one from the given identity
     */
    private async updatePaymentAddress(identity: resources.Identity, listingItemTemplate: resources.ListingItemTemplate):
        Promise<resources.ListingItemTemplate> {

        return await this.generateCryptoAddressForEscrowType(identity, listingItemTemplate.PaymentInformation.Escrow.type)
            .then( async paymentAddress => {
                // create new CryptocurrencyAddress related to the ListingItemTemplate
                return await this.cryptocurrencyAddressService.create({
                    profile_id: listingItemTemplate.Profile.id,
                    type: paymentAddress.type,
                    address: paymentAddress.address
                } as CryptocurrencyAddressCreateRequest)
                    .then(async cryptocurrencyAddressModel => {
                        // update relation to the created CryptocurrencyAddress
                        const cryptocurrencyAddress: resources.CryptocurrencyAddress = cryptocurrencyAddressModel.toJSON();
                        await this.itemPriceService.updatePaymentAddress(listingItemTemplate.PaymentInformation.ItemPrice.id, cryptocurrencyAddress.id);

                        // finally, fetch updated ListingItemTemplate
                        return await this.listingItemTemplateService.findOne(listingItemTemplate.id)
                            .then(updatedTemplate => updatedTemplate.toJSON()); // throws if not found
                    });
            });
    }

    /**
     * Post ItemImages
     *
     * @param listingItemTemplate
     * @param listingItemAddRequest
     */
    private async postListingItemImages(listingItemTemplate: resources.ListingItemTemplate, listingItemAddRequest: ListingItemAddRequest):
        Promise<SmsgSendResponse> {

        // then prepare the ListingItemImageAddRequest for sending the images
        const imageAddRequest = {
            sendParams: listingItemAddRequest.sendParams,
            listingItem: listingItemTemplate,
            market: listingItemAddRequest.market, // TODO: remove this? it doesn't seem to be used
            seller: listingItemAddRequest.seller
        } as ListingItemImageAddRequest;

        imageAddRequest.sendParams.paidMessage = false; // sending images is free for now

        const msgids: string[] = [];

        // send each image related to the ListingItem
        for (const itemImage of listingItemTemplate.ItemInformation.ItemImages) {
            imageAddRequest.image = itemImage;
            const smsgSendResponse: SmsgSendResponse = await this.listingItemImageAddActionService.post(imageAddRequest);
            msgids.push(smsgSendResponse.msgid || '');
        }

        const result = {
            result: 'Sent.',
            msgids
        } as SmsgSendResponse;

        this.log.debug('postListingItemImages(), result: ', JSON.stringify(result, null, 2));
        return result;
    }

}
