const AdministrationSettings = require("../models/administration_settings");

class AdministrationSettingsService {
  static async getSettings({ groupId, userId }) {
    if (groupId) {
      const groupSettings = await AdministrationSettings.findOne({
        scope: "group",
        group: groupId,
      }).lean();

      if (groupSettings) {
        return groupSettings;
      }
    }

    const globalSettings = await AdministrationSettings.findOne({
      scope: "global",
    }).lean();

    if (globalSettings) {
      return globalSettings;
    }

    return {
      scope: "global",
      thresholdBefore: 30,
      thresholdAfter: 30,
      updatedBy: userId,
    };
  }

  static async updateSettings({ scope, groupId, thresholdBefore, thresholdAfter, userId }) {
    const filter = {
      scope,
    };

    if (scope === "group") {
      filter.group = groupId;
    }

    const update = {
      thresholdBefore,
      thresholdAfter,
      updatedBy: userId,
    };

    if (scope === "group") {
      update.group = groupId;
    }

    const options = {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    };

    const settings = await AdministrationSettings.findOneAndUpdate(
      filter,
      update,
      options
    ).lean();

    return settings;
  }
}

module.exports = AdministrationSettingsService;

