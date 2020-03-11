import { Component } from '@angular/core';
import { ModalController, NavController, NavParams, ViewController } from 'ionic-angular';
import { DataDetailsServiceProvider } from "../../../providers/data-details-service/data-details-service";
import { SelectTrackingFrequencyPage } from "../select-tracking-frequency/select-tracking-frequency";
import { EditDataPage } from "../edit-data/edit-data";
import { CouchDbServiceProvider } from "../../../providers/couch-db-service/couch-db-service";
import * as moment from 'moment';
import { DataElement, DataType } from "../../../interfaces/customTypes";


@Component({
  selector: 'page-data-config',
  templateUrl: 'data-config.html',
})
export class DataConfigPage {
  private recommendTracking : boolean = false; // as in, recommend for a goal despite no specific recommendations
  private allGoals : string[] = [];
  private dataObject : DataType;
  private displayName : string;
  private customData : DataElement[]= [];
  private recommendedData : DataElement[]= [];
  private otherData : DataElement[] = [];
  private selectedFromList : DataElement[] = [];
  private startDate : any = null;
  private today = moment().toISOString();
  private nextYear = moment().add(1, "year").toISOString();
  private commonExpanded : boolean = false;
  private alwaysQuickTrack : DataElement[] = [];

  constructor(public navCtrl: NavController,
              public navParams: NavParams,
              public viewCtrl: ViewController,
              public dataDetailsServiceProvider: DataDetailsServiceProvider,
              public modalCtrl: ModalController,
              private couchDbService: CouchDbServiceProvider) {
  }

  ionViewDidLoad() {
    let activeGoals = this.couchDbService.getConfiguredRoutine();
    let alreadyTracking = {};
    if(activeGoals !== null){
      alreadyTracking = activeGoals['dataToTrack'] ? activeGoals['dataToTrack'] : {};
      this.allGoals = activeGoals['goals'] ? activeGoals['goals'] : [];
    }

    if (this.navParams.data['goalIDs']) { // got here via adding a goal
      this.allGoals = this.allGoals.concat(this.navParams.data['goalIDs']);
      this.dataObject = this.navParams.data['dataPage'];
      alreadyTracking = this.combineTracking(alreadyTracking, this.navParams.data['selectedData']);
    }

    else{ // got here via tracking routine modification page
      this.dataObject = this.dataDetailsServiceProvider.getConfigByName(this.navParams.data['dataType']);
      this.dataObject['dataDesc'] = this.navParams.data['dataDesc'];
    }
    this.displayName = this.dataObject.toDisplay ? this.dataObject.toDisplay : this.dataObject.dataType;
    this.startDate = this.dataObject.startDate ? new Date().toISOString() : null;

    this.getAllRecs(alreadyTracking);
  }

  combineTracking(dict1, dict2){
    if(!dict2) return dict1;
    let keys = Object.keys(dict2);
    for(let i=0; i<keys.length; i++){
      let key = keys[i];
      if(dict1[key]){
        dict1[key].concat(dict2[key]);
      }
      else{
        dict1[key] = dict2[key];
      }
    }
    return dict1;
  }

  recordTracking(trackingOfDatatype : DataElement[]){
    // put everything already being tracked into their correct lists so we can modify them accurately
    if(trackingOfDatatype){
      for(let i=0; i<trackingOfDatatype.length; i++){
        if(trackingOfDatatype[i].custom) this.customData.push(trackingOfDatatype[i]);
        else this.selectedFromList.push(trackingOfDatatype[i]);
      }
    }
  }

  getAllRecs(alreadyTracking : {[dataType:string]:DataElement[]}) {
    let dataInfo = this.dataDetailsServiceProvider.getDataLists(alreadyTracking, this.dataObject.dataType, this.allGoals);
    this.recommendedData = dataInfo['recData'];
    this.otherData = dataInfo['otherData'];
    this.commonExpanded = dataInfo['expandOther'];
    if (dataInfo['alwaysQuickTrack']) this.alwaysQuickTrack = dataInfo['alwaysQuickTrack'];
    this.recordTracking(alreadyTracking[this.dataObject.dataType]);

    if(this.dataObject.recommendForGoals){ // for ex we need them to track personalized contributors to predict
      for(let i=0; i<this.allGoals.length; i++){
        if(this.dataObject.recommendForGoals.indexOf(this.allGoals[i]) >-1){
          this.recommendTracking = true;
          break;
        }
      }
    }
  }

  replaceData(list : DataElement[], oldData : DataElement, newData : DataElement){
    // kinda dumb but ionic can't iterate dicts and we need all the data details somewhere, so eh
    let oldIndex = list.indexOf(oldData);
    if (oldIndex > -1) {
      list.splice(oldIndex, 1, newData);
    } else {
      list.push(newData);
    }
  }

  editData(oldData : DataElement, type : string) {
    let editDataModal = this.modalCtrl.create(EditDataPage, {'data': oldData,
          'dataType': this.dataObject.dataType,
          'selectedGoals': this.allGoals,
          'allowsDataGoals': this.dataObject.dataGoals},{showBackdrop:true, cssClass: 'select-modal' });

    editDataModal.onDidDismiss(newData => {
      if(newData){

        if(newData === 'remove'){
          this.remove(oldData, type);
        }

        else{
          newData.selected = true;
          if(type=="custom"){
            this.replaceData(this.customData, oldData, newData);
          }
          else if(type==='rec'){
            this.replaceData(this.recommendedData, oldData, newData);
            this.replaceData(this.selectedFromList, oldData, newData);
          }
          else if(type ==='other'){
            this.replaceData(this.otherData, oldData, newData);
            this.replaceData(this.selectedFromList, oldData, newData);
          }
        }
      }
    });

    editDataModal.present();
  }

  track(data : DataElement) {
    data.selected = true;
    this.selectedFromList.push(data);
  }

  remove(data : DataElement, category : string){
    if(category === "custom") {
      this.customData.splice(this.customData.indexOf(data), 1);
    } else {
      this.selectedFromList.splice(this.selectedFromList.indexOf(data), 1);
      data.selected = false;
    }
  }

  getQuickTrackers(selectedData) : DataElement[]{
    let quickTrackers = this.alwaysQuickTrack;
    for (let i=0; i<selectedData.length; i++) {
      if (selectedData[i].quickTrack) {
        selectedData[i].dataType = this.dataObject.dataType;
        quickTrackers.push(selectedData[i]);
      }
    }
    return quickTrackers;
  }

  continueSetup() {
    let selectedData : DataElement[] = this.dataDetailsServiceProvider.getWhetherSelected(
      this.recommendedData, this.otherData, this.customData);
    let quickTrackers : DataElement[] = this.getQuickTrackers(selectedData);

    if (this.navParams.data['goalIDs']) {
      if (selectedData.length > 0) {
        if (!this.navParams.data['selectedData']) {
          this.navParams.data['selectedData'] = {};
        }
        if (this.startDate) {
          for (let i=0; i< selectedData.length; i++) {        // specify for every change so if they add different ones
            selectedData[i]['startDate'] = this.startDate;  // at different days we still know how to filter
          }
        }
        this.navParams.data['selectedData'][this.dataObject.dataType] = selectedData;
        if (quickTrackers.length > 0) {
          if (this.navParams.data['quickTrackers']) {
            this.navParams.data['quickTrackers'] = this.navParams.data['quickTrackers'].concat(quickTrackers);
          } else {
            this.navParams.data['quickTrackers'] = quickTrackers;
          }
        }
      }
      let configData = this.dataDetailsServiceProvider.findNextConfigData(this.navParams.data['goalIDs'], this.dataObject);
      if (configData !== null) {
        this.navParams.data['dataPage'] = configData;
        this.navCtrl.push(DataConfigPage, this.navParams.data);
      } else {
        delete this.navParams.data['dataPage'];
        this.navCtrl.push(SelectTrackingFrequencyPage, this.navParams.data);
      }
    } else {
      this.viewCtrl.dismiss({'selected': selectedData, 'quickTrackers': quickTrackers});
    }
  }

}
