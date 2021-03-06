// Copyright (c) 2017-2020, The Particl Market developers
// Distributed under the GPL software license, see the accompanying
// file COPYING or https://github.com/particl/particl-market/blob/develop/LICENSE

import * from 'jest';
import * as resources from 'resources';
import { BlackBoxTestUtil } from '../lib/BlackBoxTestUtil';
import { Commands } from '../../../src/api/commands/CommandEnumType';
import { CreatableModel } from '../../../src/api/enums/CreatableModel';
import { Logger as LoggerType } from '../../../src/core/Logger';
import { ModelNotFoundException } from '../../../src/api/exceptions/ModelNotFoundException';
import { InvalidParamException } from '../../../src/api/exceptions/InvalidParamException';
import { MissingParamException } from '../../../src/api/exceptions/MissingParamException';

describe('ProfileRemoveCommand', () => {

    jasmine.DEFAULT_TIMEOUT_INTERVAL = process.env.JASMINE_TIMEOUT;

    const log: LoggerType = new LoggerType(__filename);

    const randomBoolean: boolean = Math.random() >= 0.5;
    const testUtil = new BlackBoxTestUtil(randomBoolean ? 0 : 1);

    const profileCommand = Commands.PROFILE_ROOT.commandName;
    const profileRemoveCommand = Commands.PROFILE_REMOVE.commandName;

    let profile1: resources.Profile;
    let profile2: resources.Profile;

    beforeAll(async () => {
        await testUtil.cleanDb();

        const generatedProfiles: resources.Profile[] = await testUtil.generateData(CreatableModel.PROFILE, 2, true);
        expect(generatedProfiles).toHaveLength(2);
        profile1 = generatedProfiles[0];
        profile2 = generatedProfiles[1];

    });

    test('Should fail to remove the Profile because missing profileId', async () => {
        const res = await testUtil.rpc(profileCommand, [profileRemoveCommand]);
        res.expectJson();
        expect(res.error.error.message).toBe(new MissingParamException('profileId').getMessage());
    });

    test('Should fail to remove the Profile because invalid profileId', async () => {
        const invalidProfileId = 'STRING_IS_INVALID';
        const res = await testUtil.rpc(profileCommand, [profileRemoveCommand, invalidProfileId]);
        res.expectJson();
        expect(res.error.error.message).toBe(new InvalidParamException('profileId', 'number').getMessage());
    });

    test('Should fail to remove the Profile because model not found', async () => {
        const notFoundProfileId = 0;
        const res = await testUtil.rpc(profileCommand, [profileRemoveCommand, notFoundProfileId]);
        res.expectJson();
        expect(res.error.error.message).toBe(new ModelNotFoundException('Profile').getMessage());

    });

    test('Should delete the Profile by id', async () => {
        const res = await testUtil.rpc(profileCommand, [profileRemoveCommand, profile1.id]);
        res.expectJson();
        res.expectStatusCode(200);
    });

});
